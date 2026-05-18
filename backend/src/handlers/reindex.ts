import type { Wiki } from "@shared/types.js";
import { getFeatures } from "../services/db.js";
import { reindexWikiAndCode } from "../services/reindex.js";
import type { FastifyReply } from "fastify";
import { batchAll } from "@shared/batch-ops.js";
import { ensureError } from "@shared/error.js";

const REINDEX_BATCH_SIZE = 5;

export async function reindexHandler(wiki: Wiki) {
  const features = await getFeatures(wiki.id);
  return reindexWikiAndCode(wiki.owner, wiki.repo, {
    visibility: wiki.visibility,
    existingFeatures: features,
    existingOverview: wiki.overview,
  });
}

export async function reindexAllHandler(wikis: Wiki[]) {
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
