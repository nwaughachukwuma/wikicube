import { describe, expect, it, vi } from "vitest";
import { generateAndStoreChallenges } from "@/lib/challenges";
import * as db from "@/lib/db";
import * as github from "@shared/github";
import * as generateChallengesModule from "@shared/genai/generate-challenges";
import type { Wiki, Feature, Challenge } from "@shared/types";

vi.mock("@/lib/db", () => ({
  getFeatures: vi.fn(),
  insertChallenges: vi.fn(),
}));

vi.mock("@shared/github", () => ({
  getRecentIssues: vi.fn(),
  getRecentPullRequests: vi.fn(),
}));

vi.mock("@shared/genai/generate-challenges", () => ({
  generateChallenges: vi.fn(),
}));

const makeWiki = (overrides: Partial<Wiki> = {}): Wiki =>
  ({
    id: "wiki-123",
    owner: "marcelroed",
    repo: "gigatoken",
    default_branch: "main",
    overview: "# Gigatoken",
    status: "done" as const,
    visibility: "public" as const,
    search_ready: true,
    search_error: null,
    indexed_by: null,
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
    ...overrides,
  }) as Wiki;

describe("generateAndStoreChallenges", () => {
  it("generates challenges from features, issues and PRs", async () => {
    const wiki = makeWiki();
    vi.mocked(db.getFeatures).mockResolvedValue([
      {
        id: "feat-1",
        wiki_id: wiki.id,
        slug: "fast-tokenization",
        title: "Fast tokenization",
        summary: "Tokenizes large datasets quickly.",
        markdown_content: "# Fast tokenization",
        created_at: "",
        updated_at: "",
      },
    ] as unknown as Feature[]);
    vi.mocked(github.getRecentIssues).mockResolvedValue("#1 issue");
    vi.mocked(github.getRecentPullRequests).mockResolvedValue("#2 pr");
    vi.mocked(generateChallengesModule.generateChallenges).mockResolvedValue([
      {
        role: "engineer",
        background: "Background",
        objective: "Objective",
        task: "Task",
        acceptance_criteria: "Criterion",
      },
    ]);
    vi.mocked(db.insertChallenges).mockResolvedValue([
      {
        id: "challenge-1",
        wiki_id: wiki.id,
        role: "engineer",
        background: "Background",
        objective: "Objective",
        task: "Task",
        acceptance_criteria: "Criterion",
        created_at: "",
        updated_at: "",
      },
    ] as unknown as Challenge[]);

    const result = await generateAndStoreChallenges(wiki, "marcelroed", "gigatoken");

    expect(db.getFeatures).toHaveBeenCalledWith(wiki.id);
    expect(github.getRecentIssues).toHaveBeenCalledWith("marcelroed", "gigatoken", undefined);
    expect(github.getRecentPullRequests).toHaveBeenCalledWith("marcelroed", "gigatoken", undefined);
    expect(generateChallengesModule.generateChallenges).toHaveBeenCalledWith(
      expect.objectContaining({
        owner: "marcelroed",
        repo: "gigatoken",
        overview: wiki.overview,
        issues: "#1 issue",
        pullRequests: "#2 pr",
      }),
    );
    expect(db.insertChallenges).toHaveBeenCalledWith([
      expect.objectContaining({
        wiki_id: wiki.id,
        role: "engineer",
        objective: "Objective",
      }),
    ]);
    expect(result).toHaveLength(1);
  });
});
