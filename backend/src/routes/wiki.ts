import type { FastifyInstance } from "fastify";
import { getWiki, getFeatures } from "../services/db.js";
import { getSupabaseUser } from "../services/supabase.js";
import { privateWikiGuard } from "../services/auth.js";

export default async function wikiRoutes(fastify: FastifyInstance) {
  fastify.get("/wiki/:owner/:repo", async (request, reply) => {
    const { owner, repo } = request.params as { owner: string; repo: string };

    const wiki = await getWiki(owner, repo);
    if (!wiki) {
      return reply.status(404).send({ error: "Wiki not found" });
    }

    if (wiki.visibility === "private") {
      const authHeader = request.headers.authorization ?? "";
      const bearerToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : undefined;
      const user = await getSupabaseUser(bearerToken);
      const guard = privateWikiGuard(wiki, user?.id, reply);
      if (guard && guard.error) return reply.status(403).send(guard);
    }

    const features = await getFeatures(wiki.id);
    const headers: Record<string, string> = {};
    if (wiki.status === "done" && features.length) {
      headers["Cache-Control"] = "public, s-maxage=3600, stale-while-revalidate=300";
    }

    return reply.headers(headers).send({ wiki, features });
  });
}
