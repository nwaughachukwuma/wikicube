import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { getWikiById, matchChunks, getFeatures } from "../services/db.js";
import { generateEmbeddings } from "../services/genai.js";
import { getSupabaseUser } from "../services/supabase.js";
import { privateWikiGuard } from "../services/auth.js";

const SearchSchema = z.object({
  wikiId: z.string().min(1, "wikiId must be a non-empty string"),
  query: z.string().min(1, "query must be a non-empty string"),
});

export default async function searchRoutes(fastify: FastifyInstance) {
  fastify.post("/search", async (request, reply) => {
    const parsed = SearchSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.errors[0].message });
    }

    const { wikiId, query } = parsed.data;
    const wiki = await getWikiById(wikiId);
    if (!wiki || wiki.status !== "done") {
      return reply.status(404).send({ error: "Wiki not found or not ready" });
    }

    if (wiki.visibility === "private") {
      const authHeader = request.headers.authorization ?? "";
      const bearerToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : undefined;
      const user = await getSupabaseUser(bearerToken);
      const guard = privateWikiGuard(wiki, user?.id, reply);
      if (guard && guard.error) return reply.status(403).send(guard);
    }

    const embeddings = await generateEmbeddings([query], "RETRIEVAL_QUERY");
    if (!embeddings.length || !embeddings[0]?.length) {
      return reply.status(502).send({ error: "Failed to generate query embedding" });
    }

    const chunks = await matchChunks(wikiId, embeddings[0], {
      matchCount: 10,
      matchThreshold: 0.5,
    });

    const features = await getFeatures(wikiId);
    const featureMap = new Map(features.map((f) => [f.id, f]));

    const results = chunks.map((chunk) => {
      const feature = chunk.feature_id ? featureMap.get(chunk.feature_id as string) : null;
      return {
        content: chunk.content.slice(0, 300),
        sourceType: chunk.source_type,
        sourceFile: chunk.source_file,
        similarity: chunk.similarity,
        featureTitle: feature?.title || null,
        featureSlug: feature?.slug || null,
      };
    });

    return reply.send({ results });
  });
}
