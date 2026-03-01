import {
  getRepoMeta,
  getRepoTree,
  filterTree,
  formatTreeString,
  fetchProjectContext,
} from "../github";
import { upsertWiki } from "../db";
import { logger } from "../logger";
import type { AnalysisEvent, PipelineOptions, RepoMeta } from "../types";

const log = logger("context-gatherer");

export interface GatheredContext {
  meta: RepoMeta;
  wikiId: string;
  treeString: string;
  treePaths: string[];
  readme: string;
  manifests: string;
}

/** Phase A: Fetch repo metadata, file tree, README, and manifests */
export async function gatherContext(
  owner: string,
  repo: string,
  onEvent: (event: AnalysisEvent) => void,
  opts: PipelineOptions = {},
): Promise<GatheredContext> {
  onEvent({
    type: "status",
    status: "fetching_tree",
    message: "Fetching repository metadata...",
  });

  const metaDone = log.time("getRepoMeta");
  const meta = await getRepoMeta(owner, repo, opts.githubToken);
  metaDone({ defaultBranch: meta.defaultBranch });

  onEvent({
    type: "status",
    status: "fetching_tree",
    message: "Fetching file tree...",
  });

  const treeDone = log.time("upsertWiki+getRepoTree");
  const [wiki, rawTree] = await Promise.all([
    upsertWiki(owner, repo, meta.defaultBranch, {
      visibility: meta.isPrivate ? "private" : "public",
      indexedBy: meta.isPrivate ? opts.userId : undefined,
    }),
    getRepoTree(owner, repo, meta.defaultBranch, opts.githubToken),
  ]);
  treeDone({ rawTreeSize: rawTree.length });

  const wikiId = wiki.id;
  const tree = filterTree(rawTree);
  const treeString = formatTreeString(tree);
  const treePaths = tree.map((e) => e.path);

  log.info("tree filtered", {
    wikiId,
    rawFiles: rawTree,
    filteredFiles: tree,
  });

  onEvent({
    type: "status",
    status: "fetching_tree",
    message: "Fetching README and manifests...",
  });

  const ctxDone = log.time("fetchProjectContext");
  const { readme, manifests } = await fetchProjectContext(
    owner,
    repo,
    meta.defaultBranch,
    treePaths,
    opts.githubToken,
  );
  ctxDone({
    readme,
    readmeLength: readme.length,
    manifests,
    manifestLength: manifests.length,
  });

  return {
    meta,
    wikiId,
    treeString,
    treePaths,
    readme,
    manifests,
  };
}
