import { NextRequest, NextResponse } from "next/server";
import { parseRepoUrl } from "@/lib/github";
import { runAnalysisPipeline } from "@/lib/analyzer";
import { getWiki } from "@/lib/db";
import type { AnalysisEvent } from "@/lib/types";

export const maxDuration = 300; // 5 minutes for large repos

export async function POST(req: NextRequest) {
  try {
    const { repoUrl } = await req.json();
    if (!repoUrl) {
      return NextResponse.json(
        { error: "repoUrl is required" },
        { status: 400 },
      );
    }

    const { owner, repo } = parseRepoUrl(repoUrl);

    // Check if we already have a completed wiki
    const existing = await getWiki(owner, repo);
    if (existing && existing.status === "done") {
      return NextResponse.json({
        wikiId: existing.id,
        status: "done",
        cached: true,
      });
    }

    // Stream progress via SSE
    const encoder = new TextEncoder();
    const stream = new TransformStream();
    const writer = stream.writable.getWriter();

    const sendEvent = async (event: AnalysisEvent) => {
      try {
        await writer.write(
          encoder.encode(`data: ${JSON.stringify(event)}\n\n`),
        );
      } catch {
        // Client disconnected
      }
    };

    // Run pipeline in the background (non-blocking for the stream)
    runAnalysisPipeline(owner, repo, (event) => {
      sendEvent(event);
    })
      .then(() => writer.close())
      .catch(async (err) => {
        await sendEvent({
          type: "error",
          message: err instanceof Error ? err.message : "Pipeline failed",
        });
        await writer.close();
      });

    return new Response(stream.readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (err) {
    console.error("Analyze API error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}
