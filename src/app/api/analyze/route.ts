import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { AnalysisEvent } from "@/lib/types";
import { parseRepoUrl, GITHUB_URL_RE } from "@/lib/github";
import { runAnalysisPipeline } from "@/lib/code-analyzer";
import { getCachedWiki } from "@/lib/cache";
import { extractError } from "@/lib/error";

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

export const maxDuration = 900; // 15 minutes for large repos

/**
 *  Notes:
 * - Use a job queue for better reliability and scalability (e.g. BullMQ, Sidekiq)
 * - Async Queue like Google Cloud Tasks or AWS SQS could also work without needing a separate worker process
 * - I'll prefer to move this off Next.js to a proper backend service.
 */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = PostSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "repoUrl is required" }, { status: 400 });
  }

  const { repoUrl } = parsed.data;
  const { owner, repo } = parseRepoUrl(repoUrl);
  // Check if we already have a completed wiki
  const existing = await getCachedWiki(owner, repo);
  if (existing && existing.status === "done") {
    return NextResponse.json({
      wikiId: existing.id,
      status: "done",
      cached: true,
    });
  }

  // TODO: we can track status here if we wired in a Queue
  // For now, restart for any other state other than 'done'.
  // Stream progress via SSE
  const encoder = new TextEncoder();
  const stream = new TransformStream();
  const writer = stream.writable.getWriter();

  const sendEvent = async (event: AnalysisEvent) => {
    try {
      await writer.write(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
    } catch {
      // Client disconnected
    }
  };

  // Run pipeline in the background (non-blocking for the stream)
  void runAnalysisPipeline(owner, repo, sendEvent)
    .catch(async (err) => {
      await sendEvent({
        type: "error",
        message: extractError(err, "Pipeline failed"),
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
