import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  getWikiById,
  getFeatures,
  matchChunks,
  insertChatMessage,
  getChatSessionMessages,
} from "../services/db.js";
import { generateEmbeddings, chatWithWiki } from "../services/genai.js";
import { authRouteGuard, privateWikiGuard } from "../services/auth.js";

const ChatSchema = z.object({
  wikiId: z.string().min(1, "wikiId must be a non-empty string"),
  sessionId: z.string().min(1, "sessionId must be a non-empty string"),
  question: z.string().min(1, "question must be a non-empty string"),
  pageContext: z.string().optional(),
});

export default async function chatRoutes(fastify: FastifyInstance) {
  fastify.post("/chat", async (request, reply) => {
    const authHeader = request.headers.authorization ?? "";
    const bearerToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : undefined;

    const { user, err } = await authRouteGuard(bearerToken, reply);
    if (err) return reply.status(401).send(err);

    const parsed = ChatSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.errors[0].message });
    }
    const { wikiId, sessionId, question, pageContext } = parsed.data;

    const wiki = await getWikiById(wikiId);
    if (!wiki || wiki.status !== "done") {
      return reply.status(404).send({ error: "Wiki not found or not ready" });
    }

    const guard = privateWikiGuard(wiki, user?.id, reply);
    if (guard && guard.error) return reply.status(403).send(guard);

    const history = (await getChatSessionMessages(wikiId, sessionId, user?.id)).map((m) => ({
      role: m.role,
      content: m.content,
    }));

    await insertChatMessage(wikiId, sessionId, "user", question, user?.id);

    const contextChunks: string[] = [];
    if (wiki.overview) contextChunks.push(`[Wiki Overview]\n${wiki.overview}`);
    if (pageContext) contextChunks.push(`[Current Page Context]\n${pageContext}`);

    const embeddings = await generateEmbeddings([question], "QUESTION_ANSWERING");
    if (embeddings.length && embeddings[0].length) {
      const chunks = await matchChunks(wikiId, embeddings[0], {
        matchCount: 8,
        matchThreshold: 0.5,
      });
      for (const c of chunks) {
        const prefix = c.source_file ? `[Source: ${c.source_file}]\n` : "";
        contextChunks.push(`${prefix}${c.content}`);
      }
    }

    if (contextChunks.length <= (pageContext ? 1 : 0)) {
      const features = await getFeatures(wikiId);
      for (const f of features) {
        contextChunks.push(
          `[Feature: ${f.title}]\nSummary: ${f.summary}\n${f.markdown_content}`,
        );
      }
    }

    const stream = await chatWithWiki(question, contextChunks, history);
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
          await insertChatMessage(wikiId, sessionId, "assistant", fullContent, user?.id);
        }
      } catch {}
    })();

    reply.raw.writeHead(200, {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });

    const reader = clientStream.getReader();
    void (async () => {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          reply.raw.write(value);
        }
      } catch {
      } finally {
        reply.raw.end();
      }
    })();
  });
}
