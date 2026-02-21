import { NextRequest, NextResponse } from "next/server";
import { getWikiById, matchChunks } from "@/lib/db";
import { generateEmbeddings, chatWithWiki } from "@/lib/openai";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const { wikiId, question, history = [] } = await req.json();

    if (!wikiId || !question) {
      return NextResponse.json(
        { error: "wikiId and question are required" },
        { status: 400 },
      );
    }

    // Verify wiki exists
    const wiki = await getWikiById(wikiId);
    if (!wiki || wiki.status !== "done") {
      return NextResponse.json(
        { error: "Wiki not found or not ready" },
        { status: 404 },
      );
    }

    // Embed the question
    const [queryEmbedding] = await generateEmbeddings([question]);

    // Semantic search for relevant chunks
    const chunks = await matchChunks(wikiId, queryEmbedding, 8, 0.5);

    const contextChunks = chunks.map((c) => {
      const prefix = c.source_file ? `[Source: ${c.source_file}]\n` : "";
      return `${prefix}${c.content}`;
    });

    // Stream AI response
    const stream = await chatWithWiki(question, contextChunks, history);

    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache",
      },
    });
  } catch (err) {
    console.error("Chat API error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}
