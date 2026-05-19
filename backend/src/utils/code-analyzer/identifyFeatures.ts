/* ─── Feature Identifier ─── */
import { logger } from "@shared/logger.js";
import type {
  AnalysisEvent,
  IdentifiedFeature,
  RepoMeta,
} from "@shared/types.js";
import { updateWikiStatus } from "../../services/db.js";
import { identifyFeatures } from "@shared/genai/index.js";

const log = logger("feature-identifier");

function validateFilePaths(
  features: IdentifiedFeature[],
  treePaths: string[],
): IdentifiedFeature[] {
  const treeSet = new Set(treePaths);
  const basenameMap = new Map<string, string[]>();
  for (const p of treePaths) {
    const base = p.split("/").pop() ?? p;
    if (!basenameMap.has(base)) basenameMap.set(base, []);
    basenameMap.get(base)!.push(p);
  }

  return features.map((feature) => {
    const validated: string[] = [];
    for (const file of feature.relevantFiles) {
      if (treeSet.has(file)) {
        validated.push(file);
      } else {
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

  if (!identifiedFeatures.length)
    throw new Error("No features identified in repository");

  const validated =
    treePaths.length > 0
      ? validateFilePaths(identifiedFeatures, treePaths)
      : identifiedFeatures;

  onEvent({ type: "features_list", features: validated.map((f) => f.title) });
  onEvent({
    type: "status",
    status: "generating_pages",
    message: `Found ${identifiedFeatures.length} features, processing top ${validated.length}. Generating wiki pages...`,
  });

  return validated;
}
