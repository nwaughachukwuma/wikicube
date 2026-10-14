/* ─── Analyzer ─── */
import { logger } from "@shared/logger.js";
import { ensureError } from "@shared/error.js";
import type {
  AnalysisEvent,
  PipelineOptions,
  WikiStatus,
} from "@shared/types.js";
import {
  updateWikiStatus,
  markSearchFailed,
  completeGeneration,
  deleteChunks,
  deleteFeaturesBelowGeneration,
  releaseRefresh,
} from "../../services/db.js";
import { embedWikiAndCode, generateOverviewPage } from "./embedder.js";
import { generateAllPages } from "./pageGenerator.js";
import { identifyRepoFeatures } from "./identifyFeatures.js";
import { gatherContext } from "./gatherContext.js";

const log = logger("repo:analyzer");

export async function runAnalysisPipeline(
  owner: string,
  repo: string,
  onEvent: (event: AnalysisEvent) => void,
  opts: PipelineOptions = {},
): Promise<string> {
  log.info("pipeline started", { owner, repo, refresh: !!opts.refresh });
  const pipelineDone = log.time("pipeline");
  try {
    const contextResult = await gatherContext(owner, repo, onEvent, opts);
    const { meta, wiki, commitSha, treeString, treePaths, readme, manifests } =
      contextResult;
    const wikiId = wiki.id;

    // A refresh builds the next generation next to the live one and leaves
    // the wiki row alone until completeGeneration switches readers over
    const generation = opts.refresh ? wiki.generation + 1 : wiki.generation;
    const setStatus = (status: WikiStatus) =>
      opts.refresh ? Promise.resolve() : updateWikiStatus(wikiId, status);

    await setStatus("identifying_features");
    const identifiedFeatures = await identifyRepoFeatures({
      owner,
      repo,
      treeString,
      readme,
      manifests,
      meta,
      onEvent,
      treePaths,
    });

    await setStatus("generating_pages");
    const { features, sourceFiles } = await generateAllPages(
      identifiedFeatures,
      owner,
      repo,
      meta,
      wikiId,
      generation,
      onEvent,
      opts.githubToken,
    );
    if (opts.refresh && !features.length) {
      throw new Error("Refresh generated no pages; keeping the live wiki");
    }

    const overview = await generateOverviewPage({
      owner,
      repo,
      description: meta.description,
      readme,
      features,
      onEvent,
    });

    await completeGeneration(wikiId, {
      generation,
      overview,
      defaultBranch: meta.defaultBranch,
      commitSha,
    });
    // Keep the previous generation so readers holding the old wiki row (or a
    // cached copy) can still load its pages; anything older goes. The new
    // generation is live now, so a failed cleanup must not fail the run.
    await deleteFeaturesBelowGeneration(wikiId, generation - 1).catch(
      (err: unknown) =>
        log.warn("old feature cleanup failed", {
          wikiId,
          error: err instanceof Error ? err.message : String(err),
        }),
    );
    pipelineDone({ wikiId, featureCount: features.length, generation });
    onEvent({ type: "done", wikiId });

    // Rebuild the search index from scratch for the new generation
    void deleteChunks(wikiId)
      .then(() =>
        embedWikiAndCode({ wikiId, features, sourceFiles, overview, onEvent }),
      )
      .catch(async (err) => {
        const normalizedError = ensureError(err, "Background embedding failed");
        log.error("Background embedding failed", {
          wikiId,
          error: normalizedError.message,
          stack: normalizedError.stack,
        });
        onEvent({
          type: "status",
          status: "error",
          message: "Background embedding failed.",
        });
        await markSearchFailed(wikiId, normalizedError.message);
      })
      // Hold a refresh's lock until its index is rebuilt, so a second
      // refresh can't interleave with this one's chunk deletes and inserts
      .finally(() => (opts.refresh ? releaseRefresh(wikiId) : undefined))
      .catch((err: unknown) =>
        log.error("post-generation cleanup failed", {
          wikiId,
          error: err instanceof Error ? err.message : String(err),
        }),
      );

    return wikiId;
  } catch (err) {
    const normalizedError = ensureError(err, "Pipeline failed");
    log.error("pipeline failed", {
      owner,
      repo,
      error: normalizedError.message,
      stack: normalizedError.stack,
    });
    onEvent({
      type: "error",
      message: err instanceof Error ? err.message : "Unknown error",
    });
    throw err;
  }
}
