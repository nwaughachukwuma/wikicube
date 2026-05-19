/* ─── Analyzer ─── */
import { logger } from "@shared/logger.js";
import { ensureError } from "@shared/error.js";
import type { AnalysisEvent, PipelineOptions } from "@shared/types.js";
import { updateWikiStatus, markSearchFailed } from "../../services/db.js";
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
  log.info("pipeline started", { owner, repo });
  const pipelineDone = log.time("pipeline");
  try {
    const contextResult = await gatherContext(owner, repo, onEvent, opts);
    const { meta, wikiId, treeString, treePaths, readme, manifests } =
      contextResult;

    const identifiedFeatures = await identifyRepoFeatures({
      owner,
      repo,
      wikiId,
      treeString,
      readme,
      manifests,
      meta,
      onEvent,
      treePaths,
    });

    await updateWikiStatus(wikiId, "generating_pages");
    const { features, sourceFiles } = await generateAllPages(
      identifiedFeatures,
      owner,
      repo,
      meta,
      wikiId,
      onEvent,
      opts.githubToken,
    );

    const overview = await generateOverviewPage({
      wikiId,
      owner,
      repo,
      description: meta.description,
      readme,
      features,
      onEvent,
    });

    await updateWikiStatus(wikiId, "done");
    pipelineDone({ wikiId, featureCount: features.length });
    onEvent({ type: "done", wikiId });

    void embedWikiAndCode({
      wikiId,
      features,
      sourceFiles,
      overview,
      onEvent,
    }).catch(async (err) => {
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
    });

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
