import { ensureError } from "@shared/error.js";
import type { Wiki } from "@shared/types.js";
import { markSearchFailed, deleteChunks, getFeatures } from "./db.js";
import { embedWikiAndCode } from "../utils/code-analyzer/embedder.js";
import { logger } from "@shared/logger.js";

const log = logger("repo:reindexWikiAndCode");

export async function reindexWikiAndCode(wiki: Wiki) {
  log.info("Rebuilding search index...", {
    type: "status",
    status: "embedding",
  });
  const features = await getFeatures(wiki.id);

  // delete previous partial chunks
  await deleteChunks(wiki.id);

  await embedWikiAndCode({
    wikiId: wiki.id,
    features,
    sourceFiles: new Map(),
    overview: wiki.overview,
    onEvent: () => {},
  }).catch(async (err) => {
    const normalizedError = ensureError(err, "Background embedding failed");
    log.error("Background embedding failed", {
      wikiId: wiki.id,
      error: normalizedError.message,
      stack: normalizedError.stack,
    });

    await markSearchFailed(wiki.id, normalizedError.message);

    throw normalizedError;
  });

  return wiki.id;
}
