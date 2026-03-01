import { updateWikiStatus } from "../db";
import { logger } from "../logger";
import type { AnalysisEvent, PipelineOptions } from "../types";
import { gatherContext } from "./contextGatherer";
import { identifyRepoFeatures } from "./featureIdentifier";
import { generateAllPages } from "./pageGenerator";
import { generateOverviewPage, embedWikiAndCode } from "./embedder";
import { extractError } from "../error";

const log = logger("repo:analyzer");

/** Run the full analysis pipeline with SSE progress reporting */
export async function runAnalysisPipeline(
  owner: string,
  repo: string,
  onEvent: (event: AnalysisEvent) => void,
  opts: PipelineOptions = {},
): Promise<string> {
  log.info("pipeline started", { owner, repo });
  const pipelineDone = log.time("pipeline");
  try {
    // Phase A: Gather repo context (metadata, tree, README, manifests)
    const contextResult = await gatherContext(owner, repo, onEvent, opts);
    const { meta, wikiId, treeString, treePaths, readme, manifests } =
      contextResult;

    // Phase B: Identify user-facing features
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

    // Phases C+D: Fetch source files and generate wiki pages (concurrent)
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

    // Phase E: Generate overview page (blocking — we need the content persisted)
    const overview = await generateOverviewPage({
      wikiId,
      owner,
      repo,
      description: meta.description,
      readme,
      features,
      onEvent,
    });

    // Mark wiki as "done" so the user can start reading immediately
    await updateWikiStatus(wikiId, "done");
    pipelineDone({
      wikiId,
      featureCount: features.length,
    });

    onEvent({ type: "done", wikiId });

    // Phase F: Chunk + embed in background (fire-and-forget).
    // Search/chat will return empty results until this completes — acceptable for v1.
    void embedWikiAndCode({
      wikiId,
      features,
      sourceFiles,
      overview,
      onEvent,
    }).catch((err) =>
      log.error("background embedding failed", {
        wikiId,
        error: extractError(err),
      }),
    );

    return wikiId;
  } catch (err) {
    log.error("pipeline failed", {
      owner,
      repo,
      // @ts-expect-error - err might not be an Error object
      error: extractError(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
    onEvent({
      type: "error",
      message: err instanceof Error ? err.message : "Unknown error",
    });
    throw err;
  }
}
