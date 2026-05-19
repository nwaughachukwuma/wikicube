import type { Wiki } from "@shared/types.js";
import { reindexWikiAndCode } from "../services/reindex.js";
import { batchAll } from "@shared/batch-ops.js";
import { ensureError } from "@shared/error.js";

const REINDEX_BATCH_SIZE = 5;

export async function reindexAllHandler(wikis: Wiki[]) {
  return batchAll(
    wikis,
    async (wiki) =>
      reindexWikiAndCode(wiki)
        .then(() => ({
          owner: wiki.owner,
          repo: wiki.repo,
          status: "ok" as const,
          message: null,
        }))
        .catch((err) => ({
          owner: wiki.owner,
          repo: wiki.repo,
          status: "error" as const,
          message: ensureError(err, "Reindexing failed"),
        })),
    REINDEX_BATCH_SIZE,
  );
}
