import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { AnalysisEvent } from "@/lib/types";
import { parseRepoUrl, GITHUB_URL_RE } from "@/lib/github";
import { runAnalysisPipeline } from "@/lib/code-analyzer";
import { getWiki } from "@/lib/db";
import { extractError } from "@/lib/error";
import { getSupabaseSession } from "@/lib/supabase/server";
import { authRouteGuard } from "@/lib/db.utils";

const PostSchema = z.object({
  repoUrl: z
    .string()
    .nonempty("repoUrl is required")
    .url("Invalid repository URL")
    .refine(
      (url) => url.match(GITHUB_URL_RE),
      "Only GitHub repository URLs are allowed",
    ),
});

export const maxDuration = 300; // 5 minutes for large repos

export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = PostSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "repoUrl is required" }, { status: 400 });
  }

  const { repoUrl } = parsed.data;
  const { owner, repo } = parseRepoUrl(repoUrl);

  const session = await getSupabaseSession();
  const githubToken = session?.provider_token || void 0;
  // If a GitHub token is provided it means the user wants to index a personal/private repo
  // — require Supabase authentication so we can record indexed_by.
  let userId: string | undefined;
  if (githubToken) {
    const { user, err } = await authRouteGuard("Re-authenticate to continue");
    if (err) return err;
    userId = user.id;
  }

  // Check if we already have a completed wiki
  const existing = await getWiki(owner, repo);
  if (existing && existing.status === "done") {
    return NextResponse.json({
      wikiId: existing.id,
      status: "done",
      cached: true,
    });
  }

  const encoder = new TextEncoder();
  const stream = new TransformStream();
  const writer = stream.writable.getWriter();
  const sendEvent = async (evt: AnalysisEvent) => {
    try {
      await writer.write(encoder.encode(`data: ${JSON.stringify(evt)}\n\n`));
    } catch {}
  };

  const pipelineOpts = {
    githubToken,
    userId,
    visibility: githubToken ? ("private" as const) : ("public" as const),
  };

  // Run pipeline in the background (non-blocking for the stream)
  void runAnalysisPipeline(owner, repo, sendEvent, pipelineOpts)
    .catch(async (err) => {
      await sendEvent({
        type: "error",
        message: extractError(err, "Repo analysis pipeline failed"),
      });
    })
    .finally(() => writer.close());

  return new Response(stream.readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
