import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Wiki } from "@shared/types.js";
import * as db from "../../../src/services/db.js";
import * as context from "../../../src/utils/code-analyzer/gatherContext.js";
import * as pages from "../../../src/utils/code-analyzer/pageGenerator.js";
import * as embedder from "../../../src/utils/code-analyzer/embedder.js";
import { runAnalysisPipeline } from "../../../src/utils/code-analyzer/analyzer.js";

vi.mock("../../../src/services/db.js", () => ({
  updateWikiStatus: vi.fn(),
  markSearchFailed: vi.fn(),
  completeGeneration: vi.fn(),
  deleteChunks: vi.fn(),
  deleteFeaturesBelowGeneration: vi.fn(),
}));

vi.mock("../../../src/utils/code-analyzer/gatherContext.js", () => ({
  gatherContext: vi.fn(),
}));

vi.mock("../../../src/utils/code-analyzer/identifyFeatures.js", () => ({
  identifyRepoFeatures: vi.fn().mockResolvedValue([]),
}));

vi.mock("../../../src/utils/code-analyzer/pageGenerator.js", () => ({
  generateAllPages: vi.fn(),
}));

vi.mock("../../../src/utils/code-analyzer/embedder.js", () => ({
  generateOverviewPage: vi.fn().mockResolvedValue("# Overview"),
  embedWikiAndCode: vi.fn().mockResolvedValue(undefined),
}));

const wiki = { id: "wiki-1", generation: 3 } as Wiki;
const meta = { defaultBranch: "main", description: "" };
const feature = { id: "feat-1", title: "Tokenizer" };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(context.gatherContext).mockResolvedValue({
    meta,
    wiki,
    commitSha: "abc123",
    treeString: "",
    treePaths: [],
    readme: "",
    manifests: "",
  } as any);
  vi.mocked(pages.generateAllPages).mockResolvedValue({
    features: [feature],
    sourceFiles: new Map(),
  } as any);
  vi.mocked(db.deleteChunks).mockResolvedValue(undefined);
});

describe("runAnalysisPipeline", () => {
  it("generates into the live generation and records the commit", async () => {
    await runAnalysisPipeline("o", "r", () => {});

    expect(db.updateWikiStatus).toHaveBeenCalledWith(
      "wiki-1",
      "identifying_features",
    );
    expect(vi.mocked(pages.generateAllPages).mock.calls[0][5]).toBe(3);
    expect(db.completeGeneration).toHaveBeenCalledWith("wiki-1", {
      generation: 3,
      overview: "# Overview",
      defaultBranch: "main",
      commitSha: "abc123",
    });
  });

  it("builds the next generation on refresh without touching the wiki status", async () => {
    await runAnalysisPipeline("o", "r", () => {}, { refresh: true });

    expect(db.updateWikiStatus).not.toHaveBeenCalled();
    expect(vi.mocked(pages.generateAllPages).mock.calls[0][5]).toBe(4);
    expect(db.completeGeneration).toHaveBeenCalledWith(
      "wiki-1",
      expect.objectContaining({ generation: 4, commitSha: "abc123" }),
    );
    // keeps the generation it replaced, drops anything older
    expect(db.deleteFeaturesBelowGeneration).toHaveBeenCalledWith("wiki-1", 3);
  });

  it("rebuilds the search index after switching generations", async () => {
    await runAnalysisPipeline("o", "r", () => {}, { refresh: true });
    await vi.waitFor(() =>
      expect(embedder.embedWikiAndCode).toHaveBeenCalled(),
    );

    expect(db.deleteChunks).toHaveBeenCalledWith("wiki-1");
    expect(
      vi.mocked(db.completeGeneration).mock.invocationCallOrder[0],
    ).toBeLessThan(vi.mocked(db.deleteChunks).mock.invocationCallOrder[0]);
  });

  it("keeps the live wiki when a refresh produces no pages", async () => {
    vi.mocked(pages.generateAllPages).mockResolvedValue({
      features: [],
      sourceFiles: new Map(),
    });

    await expect(
      runAnalysisPipeline("o", "r", () => {}, { refresh: true }),
    ).rejects.toThrow(/no pages/);
    expect(db.completeGeneration).not.toHaveBeenCalled();
  });
});
