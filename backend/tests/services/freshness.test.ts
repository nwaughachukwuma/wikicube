import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Wiki } from "@shared/types.js";
import * as github from "@shared/github.js";
import * as db from "../../src/services/db.js";
import * as refresh from "../../src/services/refresh.js";
import {
  checkWiki,
  runFreshnessSweep,
  shouldRefresh,
  MAX_REFRESHES_PER_SWEEP,
} from "../../src/services/freshness.js";

vi.mock("@shared/github.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@shared/github.js")>()),
  getBranchHeadSha: vi.fn(),
  getChangedFiles: vi.fn(),
  hasCommitsSince: vi.fn(),
}));

vi.mock("../../src/services/db.js", () => ({
  claimRefresh: vi.fn(),
  listRefreshCandidates: vi.fn(),
  recordFreshnessCheck: vi.fn(),
}));

vi.mock("../../src/services/refresh.js", () => ({
  runRefresh: vi.fn(),
}));

const NOW = Date.parse("2026-10-12T00:00:00Z");
const daysAgo = (days: number) =>
  new Date(NOW - days * 24 * 60 * 60 * 1000).toISOString();

const makeWiki = (overrides: Partial<Wiki> = {}) =>
  ({
    id: "wiki-1",
    owner: "o",
    repo: "r",
    default_branch: "main",
    status: "done",
    visibility: "public",
    generation: 0,
    source_commit_sha: "old",
    generated_at: daysAgo(10),
    ...overrides,
  }) as Wiki;

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
});

describe("shouldRefresh", () => {
  it.each([
    { changedFiles: 0, age: 400, expected: false, why: "nothing changed" },
    { changedFiles: 50, age: 3, expected: false, why: "regenerated recently" },
    { changedFiles: 10, age: 8, expected: true, why: "enough files changed" },
    { changedFiles: 3, age: 8, expected: false, why: "small change, recent" },
    { changedFiles: 1, age: 31, expected: true, why: "small change, old" },
    { changedFiles: null, age: 8, expected: true, why: "change size unknown" },
  ])("$why → $expected", ({ changedFiles, age, expected }) => {
    expect(
      shouldRefresh({ changedFiles, generatedAt: daysAgo(age), now: NOW }),
    ).toBe(expected);
  });

  it("treats a wiki with no generation time as old", () => {
    expect(shouldRefresh({ changedFiles: 1, generatedAt: null })).toBe(true);
  });
});

describe("checkWiki", () => {
  it("is fresh when HEAD matches the source commit", async () => {
    vi.mocked(github.getBranchHeadSha).mockResolvedValue("old");

    expect(await checkWiki(makeWiki())).toBe(false);
    expect(github.getChangedFiles).not.toHaveBeenCalled();
    expect(db.recordFreshnessCheck).toHaveBeenCalledWith("wiki-1", {
      latestSha: "old",
      backfillSourceSha: undefined,
    });
  });

  it("counts only relevant source files", async () => {
    vi.mocked(github.getBranchHeadSha).mockResolvedValue("new");
    vi.mocked(github.getChangedFiles).mockResolvedValue([
      ...Array.from({ length: 9 }, (_, i) => `src/file${i}.ts`),
      "package-lock.json",
      "docs/logo.png",
    ]);

    // 9 relevant files is under the threshold for a 10-day-old wiki
    expect(await checkWiki(makeWiki())).toBe(false);
    expect(github.getChangedFiles).toHaveBeenCalledWith("o", "r", "old", "new");
  });

  it("refreshes when GitHub can't compare the commits", async () => {
    vi.mocked(github.getBranchHeadSha).mockResolvedValue("new");
    vi.mocked(github.getChangedFiles).mockResolvedValue(null);

    expect(await checkWiki(makeWiki())).toBe(true);
  });

  it("backfills the source commit of an older wiki whose branch hasn't moved", async () => {
    vi.mocked(github.getBranchHeadSha).mockResolvedValue("head");
    vi.mocked(github.hasCommitsSince).mockResolvedValue(false);

    expect(await checkWiki(makeWiki({ source_commit_sha: null }))).toBe(false);
    expect(db.recordFreshnessCheck).toHaveBeenCalledWith("wiki-1", {
      latestSha: "head",
      backfillSourceSha: "head",
    });
  });

  it("refreshes an older wiki whose branch has moved", async () => {
    vi.mocked(github.getBranchHeadSha).mockResolvedValue("head");
    vi.mocked(github.hasCommitsSince).mockResolvedValue(true);

    expect(await checkWiki(makeWiki({ source_commit_sha: null }))).toBe(true);
    expect(db.recordFreshnessCheck).toHaveBeenCalledWith("wiki-1", {
      latestSha: "head",
      backfillSourceSha: undefined,
    });
  });
});

describe("runFreshnessSweep", () => {
  it("regenerates at most MAX_REFRESHES_PER_SWEEP stale wikis, oldest first", async () => {
    const wikis = Array.from({ length: MAX_REFRESHES_PER_SWEEP + 3 }, (_, i) =>
      makeWiki({ id: `wiki-${i}`, repo: `r${i}` }),
    );
    vi.mocked(db.listRefreshCandidates).mockResolvedValue(wikis);
    vi.mocked(github.getBranchHeadSha).mockResolvedValue("new");
    vi.mocked(github.getChangedFiles).mockResolvedValue(null);
    vi.mocked(db.claimRefresh).mockImplementation(
      async (id) => wikis.find((w) => w.id === id)!,
    );
    vi.mocked(refresh.runRefresh).mockResolvedValue(undefined);

    const result = await runFreshnessSweep();

    expect(result.stale).toBe(wikis.length);
    expect(refresh.runRefresh).toHaveBeenCalledTimes(MAX_REFRESHES_PER_SWEEP);
    expect(vi.mocked(refresh.runRefresh).mock.calls[0][0].id).toBe("wiki-0");
  });

  it("skips wikis whose check fails or that another refresh holds", async () => {
    const wikis = [makeWiki({ id: "gone" }), makeWiki({ id: "locked" })];
    vi.mocked(db.listRefreshCandidates).mockResolvedValue(wikis);
    vi.mocked(github.getBranchHeadSha).mockImplementation(async () => "new");
    vi.mocked(github.getChangedFiles).mockImplementation(async () => {
      throw new Error("boom");
    });
    vi.mocked(github.getChangedFiles).mockResolvedValueOnce(null);
    vi.mocked(db.claimRefresh).mockResolvedValue(null);

    const result = await runFreshnessSweep();

    expect(result).toEqual({ checked: 2, stale: 1, refreshed: [] });
    expect(refresh.runRefresh).not.toHaveBeenCalled();
  });
});
