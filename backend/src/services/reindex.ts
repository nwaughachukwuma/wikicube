import { ensureError } from "@shared/error.js";
import type { PipelineOptions } from "@shared/types.js";
import { markSearchFailed, getWiki, deleteChunks } from "./db.js";
import { embedWikiAndCode } from "./code-analyzer.js";
import { logger } from "@shared/logger.js";

const log = logger("repo:reindexWikiAndCode");

export async function reindexWikiAndCode(
  owner: string,
  repo: string,
  opts: PipelineOptions = {},
) {
  log.info("Rebuilding search index...", {
    type: "status",
    status: "embedding",
  });
  const wiki = await getWiki(owner, repo);
  if (!wiki) throw new Error("Wiki not found");

  // delete previous partial chunks
  await deleteChunks(wiki.id);

  await embedWikiAndCode({
    wikiId: wiki.id,
    features: opts.existingFeatures ?? [],
    sourceFiles: new Map(),
    overview: opts.existingOverview ?? wiki.overview,
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
