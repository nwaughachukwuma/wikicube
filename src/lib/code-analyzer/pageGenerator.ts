import { getMultipleFiles } from "../github";
import { generateFeaturePage } from "../openai";
import { insertFeature } from "../db";
import { batchAll } from "../batchOps";
import { logger } from "../logger";
import type {
  AnalysisEvent,
  Feature,
  IdentifiedFeature,
  RepoMeta,
} from "../types";
import GithubSlugger from "github-slugger";

const log = logger("page-generator");
const slugger = new GithubSlugger();

export interface PageGenResult {
  feature: Feature;
  sourceFiles: Map<string, string>;
}

/**
 * Phase C+D: Concurrently fetch relevant source files and generate a wiki
 * page for each identified feature. Returns the saved Feature records and
 * a deduplicated map of every source file fetched (used later for embedding).
 */
export async function generateAllPages(
  identifiedFeatures: IdentifiedFeature[],
  owner: string,
  repo: string,
  meta: RepoMeta,
  wikiId: string,
  onEvent: (event: AnalysisEvent) => void,
  githubToken?: string,
): Promise<{ features: Feature[]; sourceFiles: Map<string, string> }> {
  const pageGenDone = log.time("generateAllPages");

  const results = await batchAll(
    identifiedFeatures,
    async (identified, order) =>
      fetchFilesAndGeneratePage({
        identified,
        order,
        owner,
        repo,
        meta,
        wikiId,
        onEvent,
        githubToken,
      }),
    5, // max concurrency
  ).then((res) => res.filter((r) => r !== null) as PageGenResult[]);

  const features = results.map((r) => r.feature);

  // Merge per-feature source file maps into one deduplicated map
  const sourceFiles = results
    .map((r) => r.sourceFiles)
    .reduce((acc, sfiles) => {
      for (const [path, content] of sfiles) {
        acc.set(path, content);
      }
      return acc;
    }, new Map<string, string>());

  pageGenDone({
    featuresCount: features.length,
    totalIdentified: identifiedFeatures.length,
    sourceFiles: sourceFiles.size,
  });

  return { features, sourceFiles };
}

/**
 * Fetch source files and generate + persist the wiki feature page.
 * Returns null on failure so the pipeline can continue with other features.
 */
async function fetchFilesAndGeneratePage(params: {
  identified: IdentifiedFeature;
  order: number;
  owner: string;
  repo: string;
  meta: RepoMeta;
  wikiId: string;
  onEvent: (event: AnalysisEvent) => void;
  githubToken?: string;
}): Promise<PageGenResult | null> {
  const { order, owner, repo, meta, wikiId, onEvent, identified, githubToken } =
    params;
  const sourceFiles = new Map<string, string>();
  onEvent({
    type: "feature_started",
    featureTitle: identified.title,
  });

  // Fetch all files relevant to this feature
  try {
    const fetchDone = log.time(`fetchFiles:${identified.title}`);
    const fileContents = await getMultipleFiles(
      owner,
      repo,
      meta.defaultBranch,
      identified.relevantFiles,
      10,
      githubToken,
    );
    fetchDone({
      filesToFetch: identified.relevantFiles,
      filesToFetchLength: identified.relevantFiles.length,
      fileContents,
      fileContentsLength: fileContents.size,
    });

    // Save raw files for later code embedding
    for (const [path, content] of fileContents) {
      sourceFiles.set(path, content);
    }

    // Generate wiki page markdown + metadata via LLM
    const genDone = log.time(`generatePage:${identified.title}`);
    const page = await generateFeaturePage(
      `${owner}/${repo}`,
      owner,
      repo,
      meta.defaultBranch,
      identified,
      fileContents,
    );
    genDone({
      entryPoints: page.entryPoints,
      citations: page.citations,
    });

    // Persist to DB
    const slug = identified.id || slugger.slug(identified.title);
    const feature = await insertFeature({
      wiki_id: wikiId,
      slug,
      title: identified.title,
      summary: identified.summary,
      markdown_content: page.markdownContent,
      entry_points: page.entryPoints,
      citations: page.citations,
      sort_order: order,
    });

    onEvent({
      type: "feature_done",
      featureTitle: identified.title,
    });

    return { feature, sourceFiles };
  } catch (err) {
    log.error(`feature generation failed: ${identified.title}`, {
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
    onEvent({
      type: "feature_done",
      featureTitle: `${identified.title} (partial)`,
    });
    return null;
  }
}
