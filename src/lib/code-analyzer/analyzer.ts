import { updateWikiStatus } from "../db";
import { logger } from "../logger";
import type { AnalysisEvent } from "../types";
import { gatherContext } from "./contextGatherer";
import { identifyRepoFeatures } from "./featureIdentifier";
import { generateAllPages } from "./pageGenerator";
import { generateOverviewAndEmbed } from "./embedder";
import { extractError } from "../error";

const log = logger("analyzer");

/** Run the full analysis pipeline with SSE progress reporting */
export async function runAnalysisPipeline(
  owner: string,
  repo: string,
  onEvent: (event: AnalysisEvent) => void,
): Promise<string> {
  log.info("pipeline started", { owner, repo });
  const pipelineDone = log.time("pipeline");

  try {
    // Phase A: Gather repo context (metadata, tree, README, manifests)
    const { meta, wikiId, treeString, readme, manifests } = await gatherContext(
      owner,
      repo,
      onEvent,
    );

    // Phase B: Identify user-facing features
    const identifiedFeatures = await identifyRepoFeatures(
      owner,
      repo,
      wikiId,
      treeString,
      readme,
      manifests,
      meta,
      onEvent,
    );

    // Phases C+D: Fetch source files and generate wiki pages (concurrent)
    await updateWikiStatus(wikiId, "generating_pages");
    const { features, allSourceFiles } = await generateAllPages(
      identifiedFeatures,
      owner,
      repo,
      meta,
      wikiId,
      onEvent,
    );

    // Phases E+F: Generate overview page, then chunk and embed everything
    await generateOverviewAndEmbed({
      wikiId,
      owner,
      repo,
      description: meta.description,
      readme,
      features,
      allSourceFiles,
      onEvent,
    });

    // Done
    await updateWikiStatus(wikiId, "done");
    pipelineDone({ wikiId, featureCount: features.length });
    onEvent({ type: "done", wikiId });

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
