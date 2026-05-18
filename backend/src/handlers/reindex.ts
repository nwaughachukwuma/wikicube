import type { Wiki } from "@shared/types.js";
import { getFeatures } from "../services/db.js";
import { reindexWikiAndCode } from "../services/reindex.js";
import type { FastifyReply } from "fastify";
import { batchAll } from "@shared/batch-ops.js";
import { ensureError } from "@shared/error.js";

const REINDEX_BATCH_SIZE = 5;

export async function reindexHandler(wiki: Wiki, reply: FastifyReply) {
  const features = await getFeatures(wiki.id);
  await reindexWikiAndCode(wiki.owner, wiki.repo, {
    visibility: wiki.visibility,
    existingFeatures: features,
    existingOverview: wiki.overview,
  })
    .then(() => reply.send({ ok: "ok" }))
    .catch((err) => reply.status(400).send({ error: err }))
    .finally(() => reply.raw.end());
}

export async function reindexAllHandler(wikis: Wiki[], reply: FastifyReply) {
  return batchAll(
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
}
