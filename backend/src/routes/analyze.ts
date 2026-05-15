import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { parseRepoUrl, GITHUB_REPO_RE } from "@shared/github.js";
import { getWiki } from "../services/db.js";
import { authRouteGuard } from "../services/auth.js";
import { runAnalysisPipeline } from "../services/code-analyzer.js";
import { extractError } from "@shared/error.js";
import type { AnalysisEvent } from "@shared/types.js";

const PostSchema = z.object({
  repoUrl: z
    .string()
    .min(1, "repoUrl is required")
    .refine(
      (url) => url.match(GITHUB_REPO_RE),
      "Only GitHub repository URLs are allowed",
    ),
  githubToken: z.string().optional(),
});

export default async function analyzeRoutes(fastify: FastifyInstance) {
  fastify.post("/analyze", async (request, reply) => {
    const body = request.body as Record<string, unknown>;
    const parsed = PostSchema.safeParse(body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "repoUrl is required" });
    }

    const { owner, repo } = parseRepoUrl(parsed.data.repoUrl);
    const authHeader = request.headers.authorization ?? "";
    const bearerToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : undefined;

    const githubToken = parsed.data.githubToken;
    let userId: string | undefined;

    if (githubToken) {
      const { user, err } = await authRouteGuard(bearerToken, undefined, "Re-authenticate to continue");
      if (err) return reply.status(401).send(err);
      userId = user?.id;
    }

    const existing = await getWiki(owner, repo);
    if (existing && existing.status === "done") {
      return reply.send({ wikiId: existing.id, status: "done", cached: true });
    }

    const encoder = new TextEncoder();
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });

    const sendEvent = async (evt: AnalysisEvent) => {
      try {
        reply.raw.write(encoder.encode(`data: ${JSON.stringify(evt)}\n\n`));
      } catch {}
    };

    const pipelineOpts = {
      githubToken,
      userId,
      visibility: githubToken ? ("private" as const) : ("public" as const),
    };

    void runAnalysisPipeline(owner, repo, sendEvent, pipelineOpts)
      .catch(async (err) => {
        await sendEvent({
          type: "error",
          message: extractError(err, "Repo analysis pipeline failed"),
        });
      })
      .finally(() => reply.raw.end());
  });
}
