import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { parseRepoUrl, GITHUB_REPO_RE, repoGuard } from "@shared/github.js";
import { getWiki } from "../services/db.js";
import { getBearerToken, getProviderToken } from "../services/auth.js";
import { runAnalysisPipeline } from "../utils/code-analyzer/analyzer.js";
import { extractError } from "@shared/error.js";
import type { AnalysisEvent } from "@shared/types.js";
import { getSupabaseUser } from "../services/supabase.js";

const PostSchema = z.object({
  repoUrl: z
    .string()
    .min(1, "repoUrl is required")
    .refine(
      (url) => url.match(GITHUB_REPO_RE),
      "Only GitHub repository URLs are allowed",
    ),
});

export default async function analyzeRoutes(fastify: FastifyInstance) {
  fastify.post("/analyze", async (request, reply) => {
    const bearerToken = getBearerToken(request);
    const parsed = PostSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "repoUrl is required" });
    }

    const { owner, repo } = parseRepoUrl(parsed.data.repoUrl);

    let userId: string | undefined;
    const githubToken = getProviderToken(request);
    await repoGuard(owner, repo, githubToken);

    if (bearerToken) {
      const user = await getSupabaseUser(bearerToken);
      if (!user) return reply.status(401).send("Unathenticated");
      userId = user.id;
    }

    const existing = await getWiki(owner, repo);
    if (existing && existing.status === "done") {
      return reply.send({
        wikiId: existing.id,
        status: "done",
        cached: true,
      });
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

    void runAnalysisPipeline(owner, repo, sendEvent, {
      githubToken,
      userId,
      visibility: githubToken ? ("private" as const) : ("public" as const),
    })
      .catch(async (err) => {
        await sendEvent({
          type: "error",
          message: extractError(err, "Repo analysis pipeline failed"),
        });
      })
      .finally(() => reply.raw.end());
  });
}
