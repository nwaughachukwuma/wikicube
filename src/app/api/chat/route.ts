import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getWikiById, getFeatures, matchChunks } from "@/lib/db";
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

  const contextChunks: string[] = [];
  if (wiki.overview) {
    contextChunks.push(`[Wiki Overview]\n${wiki.overview.slice(0, 2000)}`);
  }

  if (pageContext) {
    contextChunks.push(`[Current Page Context]\n${pageContext}`);
  }

  // Embed the question and do semantic search
  const embeddings = await generateEmbeddings([question]);
  if (embeddings.length && embeddings[0].length) {
    const chunks = await matchChunks(wikiId, embeddings[0], 8, 0.5);
    for (const c of chunks) {
      const prefix = c.source_file ? `[Source: ${c.source_file}]\n` : "";
      contextChunks.push(`${prefix}${c.content}`);
    }
  }

  // Fallback: if semantic search returned nothing, inject feature summaries
  if (contextChunks.length <= (pageContext ? 1 : 0)) {
    const features = await getFeatures(wikiId);
    for (const f of features.slice(0, 15)) {
      contextChunks.push(
        `[Feature: ${f.title}]\nSummary: ${f.summary}\n${f.markdown_content.slice(0, 500)}`,
      );
    }
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
