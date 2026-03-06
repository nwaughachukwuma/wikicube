import { identifyFeatures } from "../genai";
import { updateWikiStatus } from "../db";
import { logger } from "../logger";
import type { AnalysisEvent, IdentifiedFeature, RepoMeta } from "../types";

const log = logger("feature-identifier");

/**
 * Maximum number of features to process.
 * Set to Infinity (or remove the slice) to process all identified features.
 */
export const MAX_FEATURES = 10;

/**
 * Validate LLM-returned file paths against the actual repo tree.
 * Falls back to basename matching for near-misses.
 */
function validateFilePaths(
  features: IdentifiedFeature[],
  treePaths: string[],
): IdentifiedFeature[] {
  const treeSet = new Set(treePaths);

  // Build a basename→fullPath map for fuzzy fallback
  const basenameMap = new Map<string, string[]>();
  for (const p of treePaths) {
    const base = p.split("/").pop() ?? p;
    if (!basenameMap.has(base)) basenameMap.set(base, []);
    const v = basenameMap.get(base) || [];
    v.push(p);
    basenameMap.set(base, v);
  }

  return features.map((feature) => {
    const validated: string[] = [];
    for (const file of feature.relevantFiles) {
      if (treeSet.has(file)) {
        validated.push(file);
      } else {
        // Fuzzy fallback: match by basename
        const base = file.split("/").pop() ?? file;
        const candidates = basenameMap.get(base);
        if (candidates?.length === 1) {
          validated.push(candidates[0]);
          log.warn("file path corrected", {
            feature: feature.title,
            from: file,
            to: candidates[0],
          });
        } else {
          log.warn("file path dropped (not in tree)", {
            feature: feature.title,
            path: file,
          });
        }
      }
    }
    return { ...feature, relevantFiles: validated };
  });
}

/** Phase B: Ask the LLM to identify user-facing features from repo context */
export async function identifyRepoFeatures(params: {
  owner: string;
  repo: string;
  wikiId: string;
  treeString: string;
  readme: string;
  manifests: string;
  meta: RepoMeta;
  onEvent: (event: AnalysisEvent) => void;
  treePaths: string[];
}): Promise<IdentifiedFeature[]> {
  const {
    wikiId,
    repo,
    owner,
    treeString,
    treePaths = [],
    onEvent,
    manifests,
    readme,
    meta,
  } = params;

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

  // Validate file paths against actual tree to drop hallucinated paths
  const validated =
    treePaths.length > 0
      ? validateFilePaths(identifiedFeatures, treePaths)
      : identifiedFeatures;

  // Cap to MAX_FEATURES for faster generation.
  const capped = validated.slice(0, MAX_FEATURES);
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
