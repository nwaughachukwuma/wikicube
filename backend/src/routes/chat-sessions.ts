import type { FastifyInstance } from "fastify";
import { getWikiChatSessions, getChatSessionMessages, getWikiById } from "../services/db.js";
import { authRouteGuard, privateWikiGuard } from "../services/auth.js";

export default async function chatSessionsRoutes(fastify: FastifyInstance) {
  fastify.get("/chat/sessions", async (request, reply) => {
    const authHeader = request.headers.authorization ?? "";
    const bearerToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : undefined;

    const { user, err } = await authRouteGuard(bearerToken, reply);
    if (err) return reply.status(401).send(err);

    const { wikiId, sessionId } = request.query as { wikiId?: string; sessionId?: string };
    if (!wikiId) {
      return reply.status(400).send({ error: "Provide wikiId or sessionId" });
    }

    if (sessionId) {
      const messages = await getChatSessionMessages(wikiId, sessionId, user?.id);
      return reply.send(messages);
    }

    const wiki = await getWikiById(wikiId);
    if (!wiki) return reply.status(404).send({ error: "Wiki not found" });

    const guard = privateWikiGuard(wiki, user?.id, reply);
    if (guard && guard.error) return reply.status(403).send(guard);

    const sessions = await getWikiChatSessions(wikiId, user!.id);
    return reply.send(sessions);
  });
}
