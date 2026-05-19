/* ─── Page Generator ─── */
import GithubSlugger from "github-slugger";
import { logger } from "@shared/logger.js";
import type {
  AnalysisEvent,
  Feature,
  IdentifiedFeature,
  RepoMeta,
} from "@shared/types.js";
import { batchAll } from "@shared/batch-ops.js";
import { getMultipleFiles } from "@shared/github.js";
import { generateFeaturePage } from "@shared/genai/index.js";
import { insertFeature } from "../../services/db.js";

const log = logger("page-generator");
const slugger = new GithubSlugger();

export interface PageGenResult {
  feature: Feature;
  sourceFiles: Map<string, string>;
}

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
    5,
  ).then((res) => res.filter((r) => r !== null) as PageGenResult[]);

  const features = results.map((r) => r.feature);
  const sourceFiles = results
    .map((r) => r.sourceFiles)
    .reduce((acc, sfiles) => {
      for (const [path, content] of sfiles) acc.set(path, content);
      return acc;
    }, new Map<string, string>());

  pageGenDone({
    featuresCount: features.length,
    totalIdentified: identifiedFeatures.length,
    sourceFiles: sourceFiles.size,
  });
  return { features, sourceFiles };
}

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
  onEvent({ type: "feature_started", featureTitle: identified.title });

  try {
    const fetchDone = log.time(`fetchFiles:${identified.title}`);
    const fileContents = await getMultipleFiles(
      owner,
      repo,
      meta.defaultBranch,
      identified.relevantFiles,
      githubToken,
    );
    fetchDone({
      filesToFetch: identified.relevantFiles.length,
      fileContents: fileContents.size,
    });

    for (const [path, content] of fileContents) sourceFiles.set(path, content);

    const genDone = log.time(`generatePage:${identified.title}`);
    const page = await generateFeaturePage(
      `${owner}/${repo}`,
      owner,
      repo,
      meta.defaultBranch,
      identified,
      fileContents,
    );
    genDone({ entryPoints: page.entryPoints, citations: page.citations });

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

    onEvent({ type: "feature_done", featureTitle: identified.title });
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
