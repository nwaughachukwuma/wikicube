import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  getWikiById,
  getFeatures,
  matchChunks,
  insertChatMessage,
  getChatSessionMessages,
} from "@/lib/db";
import { generateEmbeddings, chatWithWiki } from "@/lib/openai";
import { getUserServerClient } from "@/lib/supabase/server";
import { privateWikiGuard } from "@/lib/db.utils";

export const maxDuration = 120;

const ChatSchema = z.object({
  wikiId: z.string().min(1, "wikiId must be a non-empty string"),
  sessionId: z.string().min(1, "sessionId must be a non-empty string"),
  question: z.string().min(1, "question must be a non-empty string"),
  pageContext: z.string().optional(),
});

export async function POST(req: NextRequest) {
  // Require authentication for chat
  const supabase = await getUserServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { error: "Authentication required to use chat" },
      { status: 401 },
    );
  }
  const userId = user.id;

  const parsed = ChatSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0].message },
      { status: 400 },
    );
  }

  const { wikiId, sessionId, question, pageContext } = parsed.data;

  // Verify wiki exists
  const wiki = await getWikiById(wikiId);
  if (!wiki || wiki.status !== "done") {
    return NextResponse.json(
      { error: "Wiki not found or not ready" },
      { status: 404 },
    );
  }

  const error = privateWikiGuard(wiki, userId);
  if (error) return error;

  // Load chat history from DB for this session (scoped to this user)
  const history = (await getChatSessionMessages(wikiId, sessionId, userId)).map(
    (m) => ({ role: m.role, content: m.content }),
  );

  // Persist user message
  await insertChatMessage(wikiId, sessionId, "user", question, userId);

  // Build context chunks
  const contextChunks: string[] = [];
  if (wiki.overview) {
    contextChunks.push(`[Wiki Overview]\n${wiki.overview.slice(0, 2000)}`);
  }
  if (pageContext) {
    contextChunks.push(`[Current Page Context]\n${pageContext}`);
  }

  // Semantic search
  const embeddings = await generateEmbeddings([question]);
  if (embeddings.length && embeddings[0].length) {
    const chunks = await matchChunks(wikiId, embeddings[0], 8, 0.5);
    for (const c of chunks) {
      const prefix = c.source_file ? `[Source: ${c.source_file}]\n` : "";
      contextChunks.push(`${prefix}${c.content}`);
    }
  }

  // Fallback: inject feature summaries if semantic search returned nothing
  if (contextChunks.length <= (pageContext ? 1 : 0)) {
    const features = await getFeatures(wikiId);
    for (const f of features.slice(0, 15)) {
      contextChunks.push(
        `[Feature: ${f.title}]\nSummary: ${f.summary}\n${f.markdown_content.slice(0, 500)}`,
      );
    }
  }

  const stream = await chatWithWiki(question, contextChunks, history);

  // Tee the stream: one branch to client, one to collect + persist to DB
  const [clientStream, saveStream] = stream.tee();

  void (async () => {
    const reader = saveStream.getReader();
    const decoder = new TextDecoder();
    let fullContent = "";
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        fullContent += decoder.decode(value, { stream: true });
      }
      const finalText = decoder.decode();
      if (finalText) fullContent += finalText;

      if (fullContent) {
        await insertChatMessage(
          wikiId,
          sessionId,
          "assistant",
          fullContent,
          userId,
        );
      }
    } catch {
      // Non-fatal: don't interrupt the client stream
    }
  })();

  return new Response(clientStream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache",
    },
  });
}
