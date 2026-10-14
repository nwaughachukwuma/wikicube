/* ─── Context Gatherer ─── */
import { logger } from "@shared/logger.js";
import type {
  AnalysisEvent,
  PipelineOptions,
  RepoMeta,
  Wiki,
} from "@shared/types.js";
import {
  getRepoMeta,
  getRepoTree,
  getBranchHeadSha,
  filterTree,
  formatTreeString,
  fetchProjectContext,
} from "@shared/github.js";
import { getWiki, upsertWiki } from "../../services/db.js";

const log = logger("repo:gather-context");

export interface GatheredContext {
  meta: RepoMeta;
  wiki: Wiki;
  /** Default-branch HEAD the wiki is generated from (null if unavailable) */
  commitSha: string | null;
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
  const [wiki, rawTree, commitSha] = await Promise.all([
    opts.refresh
      ? getRefreshableWiki(owner, repo)
      : upsertWiki(owner, repo, meta.defaultBranch, {
          visibility: meta.isPrivate ? "private" : "public",
          indexedBy: opts.userId || undefined,
        }),
    getRepoTree(owner, repo, meta.defaultBranch, opts.githubToken),
    getBranchHeadSha(owner, repo, meta.defaultBranch, opts.githubToken).catch(
      (err: unknown) => {
        log.warn("could not resolve default-branch HEAD", {
          owner,
          repo,
          error: err instanceof Error ? err.message : String(err),
        });
        return null;
      },
    ),
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
    wiki,
    commitSha,
    treeString: formatTreeString(tree),
    treePaths,
    readme,
    manifests,
  };
}

// Unlike upsertWiki, never resets: a refresh must leave the live wiki alone
async function getRefreshableWiki(owner: string, repo: string) {
  const wiki = await getWiki(owner, repo);
  if (wiki?.status !== "done") {
    throw new Error(`Only finished wikis can be refreshed: ${owner}/${repo}`);
  }
  return wiki;
}
