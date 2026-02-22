import { identifyFeatures } from "../openai";
import { updateWikiStatus } from "../db";
import { logger } from "../logger";
import type { AnalysisEvent, IdentifiedFeature, RepoMeta } from "../types";

const log = logger("feature-identifier");

/**
 * Maximum number of features to process.
 * Set to Infinity (or remove the slice) to process all identified features.
 */
export const MAX_FEATURES = 10;

/** Phase B: Ask the LLM to identify user-facing features from repo context */
export async function identifyRepoFeatures(
  owner: string,
  repo: string,
  wikiId: string,
  treeString: string,
  readme: string,
  manifests: string,
  meta: RepoMeta,
  onEvent: (event: AnalysisEvent) => void,
): Promise<IdentifiedFeature[]> {
  await updateWikiStatus(wikiId, "identifying_features");

  onEvent({
    type: "status",
    status: "identifying_features",
    message: "Identifying user-facing features...",
  });

  const featuresDone = log.time("identifyFeatures");
  const identifiedFeatures = await identifyFeatures(
    `${owner}/${repo}`,
    treeString,
    readme,
    manifests,
    meta.description,
  );
  featuresDone({ identifiedFeatures });

  if (!identifiedFeatures.length) {
    throw new Error("No features identified in repository");
  }

  // Cap to MAX_FEATURES for faster generation
  const capped = identifiedFeatures.slice(0, MAX_FEATURES);

  // Emit the full list so the UI can show all features at once
  onEvent({
    type: "features_list",
    features: capped.map((f) => f.title),
  });

  onEvent({
    type: "status",
    status: "generating_pages",
    message: `Found ${identifiedFeatures.length} features, processing top ${capped.length}. Generating wiki pages...`,
  });

  return capped;
}
