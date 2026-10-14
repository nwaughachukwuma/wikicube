import { ensureError } from "@shared/error.js";
import { logger } from "@shared/logger.js";
import type { Wiki } from "@shared/types.js";
import {
  deleteFeaturesAboveGeneration,
  failRefresh,
  getWikiById,
} from "./db.js";
import { runAnalysisPipeline } from "../utils/code-analyzer/analyzer.js";

const log = logger("repo:refresh");

/**
 * Regenerate a wiki whose refresh lock the caller holds (see claimRefresh).
 * The live pages stay up until the new generation is complete; a failed run
 * discards its partial pages and records the error on the wiki.
 */
export async function runRefresh(wiki: Wiki, githubToken?: string) {
  // Pages left by an earlier refresh that died mid-run
  await deleteFeaturesAboveGeneration(wiki.id, wiki.generation);

  log.info("refresh started", {
    wikiId: wiki.id,
    owner: wiki.owner,
    repo: wiki.repo,
  });
  await runAnalysisPipeline(wiki.owner, wiki.repo, () => {}, {
    githubToken,
    refresh: true,
  }).catch(async (err) => {
    const error = ensureError(err, "Refresh failed");
    log.error("refresh failed", { wikiId: wiki.id, error: error.message });
    // Discard the new pages only if they never went live; leftovers are
    // also cleared at the start of the next refresh
    const live = await getWikiById(wiki.id).catch(() => null);
    if (live?.generation === wiki.generation) {
      await deleteFeaturesAboveGeneration(wiki.id, wiki.generation).catch(
        (cleanupErr: unknown) =>
          log.warn("partial page cleanup failed", {
            wikiId: wiki.id,
            error:
              cleanupErr instanceof Error
                ? cleanupErr.message
                : String(cleanupErr),
          }),
      );
    }
    await failRefresh(wiki.id, error.message);
    throw error;
  });
}
