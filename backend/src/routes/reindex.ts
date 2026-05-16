import type { FastifyInstance } from "fastify";
import { getWiki, getFeatures } from "../services/db.js";
import { reindexWikiAndCode } from "../services/reindex.js";
import { adminRouteGuard } from "../services/auth.js";
import { getServerClient } from "../services/supabase.js";
import { batchAll } from "@shared/batch-ops.js";
import type { Wiki } from "@shared/types.js";
import { ensureError } from "@shared/error.js";

const REINDEX_BATCH_SIZE = 5;

export default async function reindexRoutes(fastify: FastifyInstance) {
  fastify.post("/reindex", async (request, reply) => {
    const { owner, repo } = request.body as { owner: string; repo: string };
    if (!owner || !repo) {
      return reply.status(400).send({ error: "owner and repo are required" });
    }

    const wiki = await getWiki(owner, repo);
    if (!wiki) {
      return reply.status(404).send({ error: "Wiki not found" });
    }

    if (wiki.status !== "done") {
      return reply
        .status(400)
        .send({ error: "Wiki is not fully generated yet" });
    }

    const features = await getFeatures(wiki.id);

    await reindexWikiAndCode(owner, repo, {
      visibility: wiki.visibility,
      existingFeatures: features,
      existingOverview: wiki.overview,
    })
      .then(() => reply.send({ ok: "ok" }))
      .catch(async (err) => reply.status(400).send({ error: err }))
      .finally(() => reply.raw.end());
  });

  fastify.post("/reindex-all", async (request, reply) => {
    const authHeader = request.headers.authorization ?? "";
    const bearerToken = authHeader.startsWith("Bearer ")
      ? authHeader.slice(7)
      : undefined;

    const { err } = await adminRouteGuard(bearerToken, reply);
    if (err) return;

    const { data: wikis, error } = await getServerClient()
      .from("wikis")
      .select("*")
      .eq("status", "done");

    if (error) {
      return reply.status(500).send({ error: error.message });
    }

    const results = await batchAll(
      wikis,
      async (wiki: Wiki) => {
        try {
          const features = await getFeatures(wiki.id);
          return reindexWikiAndCode(wiki.owner, wiki.repo, {
            visibility: wiki.visibility,
            existingFeatures: features,
            existingOverview: wiki.overview,
          }).then(() => ({
            owner: wiki.owner,
            repo: wiki.repo,
            status: "ok" as const,
            message: null,
          }));
        } catch (err) {
          return {
            owner: wiki.owner,
            repo: wiki.repo,
            status: "error" as const,
            message: ensureError(err, "Reindexing failed"),
          };
        }
      },
      REINDEX_BATCH_SIZE,
    );
    return reply.send({ results });
  });
}
