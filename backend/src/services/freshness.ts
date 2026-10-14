import type { Wiki } from "@shared/types.js";
import { logger } from "@shared/logger.js";
import { batchAll } from "@shared/batch-ops.js";
import {
  filterTree,
  getBranchHeadSha,
  getChangedFiles,
  hasCommitsSince,
} from "@shared/github.js";
import {
  claimRefresh,
  listRefreshCandidates,
  recordFreshnessCheck,
} from "./db.js";
import { runRefresh } from "./refresh.js";

const log = logger("repo:freshness");

const DAY_MS = 24 * 60 * 60 * 1000;
/** Never regenerate a wiki more than once in this window */
export const MIN_REFRESH_AGE_DAYS = 7;
/** Regenerate after this many relevant source files change */
export const MIN_CHANGED_FILES = 10;
/** Past this age, any relevant change is enough */
export const MAX_STALE_AGE_DAYS = 30;
/** Caps LLM spend per sweep; the rest wait for the next one */
export const MAX_REFRESHES_PER_SWEEP = 10;

/**
 * Whether a wiki is worth regenerating, given how many relevant source files
 * changed since it was generated (null when GitHub couldn't tell us).
 */
export function shouldRefresh(params: {
  changedFiles: number | null;
  generatedAt: string | null;
  now?: number;
}): boolean {
  const { changedFiles, generatedAt, now = Date.now() } = params;
  if (changedFiles === 0) return false;

  const ageDays = generatedAt
    ? (now - Date.parse(generatedAt)) / DAY_MS
    : Infinity;
  if (ageDays < MIN_REFRESH_AGE_DAYS) return false;

  return (
    changedFiles === null ||
    changedFiles >= MIN_CHANGED_FILES ||
    ageDays >= MAX_STALE_AGE_DAYS
  );
}

/**
 * Compare a wiki with its repo's default branch and record the HEAD it saw.
 * Returns whether the wiki should be regenerated.
 */
export async function checkWiki(wiki: Wiki): Promise<boolean> {
  const { owner, repo, default_branch: branch } = wiki;
  const head = await getBranchHeadSha(owner, repo, branch);

  let sourceSha = wiki.source_commit_sha;
  // Wikis generated before commits were recorded: if the branch hasn't moved
  // since, HEAD is the commit they were built from
  if (
    !sourceSha &&
    wiki.generated_at &&
    !(await hasCommitsSince(owner, repo, branch, wiki.generated_at))
  ) {
    sourceSha = head;
  }

  let changedFiles: number | null = null;
  if (sourceSha === head) {
    changedFiles = 0;
  } else if (sourceSha) {
    const files = await getChangedFiles(owner, repo, sourceSha, head);
    if (files) {
      changedFiles = filterTree(
        files.map((path) => ({ path, type: "blob" as const })),
      ).length;
    }
  }

  await recordFreshnessCheck(wiki.id, {
    latestSha: head,
    backfillSourceSha: sourceSha !== wiki.source_commit_sha ? head : undefined,
  });
  return shouldRefresh({ changedFiles, generatedAt: wiki.generated_at });
}

/**
 * Check every finished public wiki and regenerate the stalest ones that
 * changed enough. Private wikis are skipped: the server's GITHUB_TOKEN can't
 * read them, so their viewers regenerate them on demand instead.
 */
export async function runFreshnessSweep() {
  const wikis = await listRefreshCandidates();
  const stale = await batchAll(
    wikis,
    (wiki) =>
      checkWiki(wiki).catch((err: unknown) => {
        log.warn("freshness check failed", {
          owner: wiki.owner,
          repo: wiki.repo,
          error: err instanceof Error ? err.message : String(err),
        });
        return false;
      }),
    5,
  ).then((results) => wikis.filter((_, i) => results[i]));

  // Candidates are ordered least recently generated first. A wiki whose last
  // refresh failed waits for an admin to regenerate it, so it can't burn the
  // budget failing every day.
  const refreshed: string[] = [];
  const retryable = stale.filter((wiki) => !wiki.refresh_error);
  for (const wiki of retryable.slice(0, MAX_REFRESHES_PER_SWEEP)) {
    const claimed = await claimRefresh(wiki.id);
    if (!claimed) continue;
    // runRefresh records failures on the wiki; carry on with the rest
    const ok = await runRefresh(claimed).then(
      () => true,
      () => false,
    );
    if (ok) refreshed.push(`${wiki.owner}/${wiki.repo}`);
  }

  log.info("freshness sweep done", {
    checked: wikis.length,
    stale: stale.length,
    refreshed,
  });
  return { checked: wikis.length, stale: stale.length, refreshed };
}
