/* ─── Context Gatherer ─── */
import { logger } from "@shared/logger.js";
import type {
  AnalysisEvent,
  PipelineOptions,
  RepoMeta,
} from "@shared/types.js";
import {
  getRepoMeta,
  getRepoTree,
  filterTree,
  formatTreeString,
  fetchProjectContext,
} from "@shared/github.js";
import { upsertWiki } from "../../services/db.js";

const log = logger("repo:gather-context");

export interface GatheredContext {
  meta: RepoMeta;
  wikiId: string;
  treeString: string;
  treePaths: string[];
  readme: string;
  manifests: string;
}

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

  const upsertAndTreeDone = log.time("upsertWiki:+:getRepoTree");
  const [wiki, rawTree] = await Promise.all([
    upsertWiki(owner, repo, meta.defaultBranch, {
      visibility: meta.isPrivate ? "private" : "public",
      indexedBy: opts.userId || undefined,
    }),
    getRepoTree(owner, repo, meta.defaultBranch, opts.githubToken),
  ]);

  upsertAndTreeDone({ wikiId: wiki.id, rawTreeSize: rawTree.length });

  const wikiId = wiki.id;
  const tree = filterTree(rawTree);
  log.info("tree filtered", {
    wikiId,
    rawFiles: rawTree.length,
    filteredFiles: tree.length,
  });
  onEvent({
    type: "status",
    status: "fetching_tree",
    message: "Fetching README and manifests...",
  });

  const fetchCtxDone = log.time("fetchProjectContext");
  const treePaths = tree.map((e) => e.path);
  const { readme, manifests } = await fetchProjectContext(
    owner,
    repo,
    meta.defaultBranch,
    treePaths,
    opts.githubToken,
  );
  fetchCtxDone({
    readmeLength: readme.length,
    manifestLength: manifests.length,
  });

  return {
    meta,
    wikiId,
    treeString: formatTreeString(tree),
    treePaths,
    readme,
    manifests,
  };
}
