import { updateWikiStatus } from "../db";
import { logger } from "../logger";
import type { AnalysisEvent, PipelineOptions } from "../types";
import { gatherContext } from "./contextGatherer";
import { identifyRepoFeatures } from "./featureIdentifier";
import { generateAllPages } from "./pageGenerator";
import { generateOverviewAndEmbed } from "./embedder";
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
    const { meta, wikiId, treeString, readme, manifests } = contextResult;

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
    const { features, sourceFiles } = await generateAllPages(
      identifiedFeatures,
      owner,
      repo,
      meta,
      wikiId,
      onEvent,
      opts.githubToken,
    );

    // Phases E+F: Generate overview page, then chunk and embed everything
    await generateOverviewAndEmbed({
      wikiId,
      owner,
      repo,
      description: meta.description,
      readme,
      features,
      sourceFiles,
      onEvent,
    });

    // Done
    await updateWikiStatus(wikiId, "done");
    pipelineDone({
      wikiId,
      featureCount: features.length,
    });

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
