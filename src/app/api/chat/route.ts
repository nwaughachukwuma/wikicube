import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getWikiById, matchChunks } from "@/lib/db";
import { generateEmbeddings, chatWithWiki } from "@/lib/openai";

export const maxDuration = 120;

const ChatSchema = z.object({
  wikiId: z.string().min(1, "wikiId must be a non-empty string"),
  question: z.string().min(1, "question must be a non-empty string"),
  pageContext: z.string().optional(),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().nonempty(),
      }),
    )
    .default([]),
});

export async function POST(req: NextRequest) {
  const parsed = ChatSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0].message },
      { status: 400 },
    );
  }

  const { wikiId, question, history, pageContext } = parsed.data;
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

  // Prepend current page context if available
  if (pageContext) {
    contextChunks.unshift(`[Current Page Context]\n${pageContext}`);
  }
  // Stream AI response
  const stream = await chatWithWiki(question, contextChunks, history);
  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache",
    },
  });
}
