import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Wiki } from "@shared/types.js";
import * as db from "../../src/services/db.js";
import * as analyzer from "../../src/utils/code-analyzer/analyzer.js";
import { runRefresh } from "../../src/services/refresh.js";

vi.mock("../../src/services/db.js", () => ({
  deleteFeaturesAboveGeneration: vi.fn(),
  failRefresh: vi.fn(),
  getWikiById: vi.fn(),
}));

vi.mock("../../src/utils/code-analyzer/analyzer.js", () => ({
  runAnalysisPipeline: vi.fn(),
}));

const wiki = { id: "wiki-1", owner: "o", repo: "r", generation: 2 } as Wiki;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(db.deleteFeaturesAboveGeneration).mockResolvedValue(undefined);
  // by default the failed refresh never went live
  vi.mocked(db.getWikiById).mockResolvedValue(wiki);
});

describe("runRefresh", () => {
  it("clears leftovers and runs the pipeline in refresh mode", async () => {
    vi.mocked(analyzer.runAnalysisPipeline).mockResolvedValue("wiki-1");

    await runRefresh(wiki, "gh-token");

    expect(db.deleteFeaturesAboveGeneration).toHaveBeenCalledWith("wiki-1", 2);
    expect(analyzer.runAnalysisPipeline).toHaveBeenCalledWith(
      "o",
      "r",
      expect.any(Function),
      { githubToken: "gh-token", refresh: true },
    );
    expect(db.failRefresh).not.toHaveBeenCalled();
  });

  it("discards partial pages and records the error when the pipeline fails", async () => {
    vi.mocked(analyzer.runAnalysisPipeline).mockRejectedValue(
      new Error("LLM quota exceeded"),
    );

    await expect(runRefresh(wiki)).rejects.toThrow("LLM quota exceeded");

    expect(db.deleteFeaturesAboveGeneration).toHaveBeenCalledTimes(2);
    expect(db.failRefresh).toHaveBeenCalledWith("wiki-1", "LLM quota exceeded");
  });

  it("never deletes pages that already went live", async () => {
    vi.mocked(analyzer.runAnalysisPipeline).mockRejectedValue(
      new Error("boom"),
    );
    vi.mocked(db.getWikiById).mockResolvedValue({ ...wiki, generation: 3 });

    await expect(runRefresh(wiki)).rejects.toThrow("boom");

    // only the leftover cleanup at the start ran
    expect(db.deleteFeaturesAboveGeneration).toHaveBeenCalledTimes(1);
    expect(db.failRefresh).toHaveBeenCalledWith("wiki-1", "boom");
  });

  it("releases the lock even when discarding partial pages fails", async () => {
    vi.mocked(analyzer.runAnalysisPipeline).mockRejectedValue(
      new Error("boom"),
    );
    vi.mocked(db.deleteFeaturesAboveGeneration)
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("supabase down"));

    await expect(runRefresh(wiki)).rejects.toThrow("boom");
    expect(db.failRefresh).toHaveBeenCalledWith("wiki-1", "boom");
  });
});
