import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildApp } from "../../src/app.js";
import * as db from "../../src/services/db.js";
import * as auth from "../../src/services/auth.js";
import * as supabase from "../../src/services/supabase.js";
import * as analyzer from "../../src/utils/code-analyzer/analyzer.js";
import * as github from "@shared/github.js";

vi.mock("@shared/github.js", () => ({
  GITHUB_REPO_RE: /(?:github\.com\/)?([A-Za-z0-9_.-]+)\/[A-Za-z0-9_.-]+$/,
  parseRepoUrl: vi.fn((url: string) => {
    const match = url.match(
      /(?:github\.com\/)?([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/,
    );
    if (!match) throw new Error("Invalid repo URL");
    return { owner: match[1], repo: match[2] };
  }),
  repoGuard: vi.fn(),
  getBearerToken: vi.fn(),
  getProviderToken: vi.fn(),
  getRepoMeta: vi.fn(),
  getRepoTree: vi.fn(),
  getMultipleFiles: vi.fn(),
}));

vi.mock("../../src/services/db.js", () => ({
  getWiki: vi.fn(),
  upsertWiki: vi.fn(),
  updateWikiStatus: vi.fn(),
  markSearchFailed: vi.fn(),
  markSearchReady: vi.fn(),
  insertFeature: vi.fn(),
  insertChunks: vi.fn(),
  getFeatures: vi.fn(),
  getWikiById: vi.fn(),
  deleteChunks: vi.fn(),
  matchChunks: vi.fn(),
  insertChatMessage: vi.fn(),
  getChatSessionMessages: vi.fn(),
  getWikiChatSessions: vi.fn(),
  getChallengesByWikiId: vi.fn(),
  insertChallenges: vi.fn(),
}));

vi.mock("../../src/services/auth.js", () => ({
  getBearerToken: vi.fn(),
  getProviderToken: vi.fn(),
  adminRouteGuard: vi.fn(),
}));

vi.mock("../../src/services/supabase.js", () => ({
  getServerClient: vi.fn(),
  getSupabaseUser: vi.fn(),
}));

vi.mock("../../src/utils/code-analyzer/analyzer.js", () => ({
  runAnalysisPipeline: vi.fn().mockResolvedValue("wiki-new-123"),
}));

describe("POST /api/analyze", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(github.repoGuard).mockResolvedValue({ ok: true } as Response);
    vi.mocked(auth.getProviderToken).mockReturnValue(undefined);
    vi.mocked(auth.getBearerToken).mockReturnValue(undefined);
  });

  it("returns 400 when repoUrl is missing", async () => {
    const app = buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/analyze",
      payload: {},
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.payload)).toEqual({ error: "repoUrl is required" });
  });

  it("returns 400 when repoUrl does not contain owner/repo", async () => {
    const app = buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/analyze",
      payload: { repoUrl: "https://example.com" },
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.payload)).toEqual({ error: "repoUrl is required" });
  });

  it("returns cached result when wiki is already done", async () => {
    vi.mocked(db.getWiki).mockResolvedValue({
      id: "wiki-abc",
      owner: "marcelroed",
      repo: "gigatoken",
      status: "done",
    } as any);

    const app = buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/analyze",
      payload: { repoUrl: "https://github.com/marcelroed/gigatoken" },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body).toEqual({
      wikiId: "wiki-abc",
      status: "done",
      cached: true,
    });
    expect(github.repoGuard).toHaveBeenCalledWith(
      "marcelroed",
      "gigatoken",
      undefined,
    );
    expect(analyzer.runAnalysisPipeline).not.toHaveBeenCalled();
  });

  it("starts the analysis pipeline when no cached wiki exists", async () => {
    vi.mocked(db.getWiki).mockResolvedValue(null);

    const app = buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/analyze",
      payload: { repoUrl: "https://github.com/marcelroed/gigatoken" },
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("text/event-stream");
    expect(analyzer.runAnalysisPipeline).toHaveBeenCalledWith(
      "marcelroed",
      "gigatoken",
      expect.any(Function),
      {
        githubToken: undefined,
        userId: undefined,
        visibility: "public",
      },
    );
  });

  it("authenticates the user when a bearer token is provided", async () => {
    vi.mocked(auth.getBearerToken).mockReturnValue("bearer-token-123");
    vi.mocked(supabase.getSupabaseUser).mockResolvedValue({
      id: "user-1",
      email: "user@example.com",
    } as any);
    vi.mocked(auth.getProviderToken).mockReturnValue("gh-provider-token");
    vi.mocked(db.getWiki).mockResolvedValue(null);

    const app = buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/analyze",
      payload: { repoUrl: "https://github.com/marcelroed/gigatoken" },
      headers: {
        authorization: "Bearer bearer-token-123",
        "x-provider-token": "gh-provider-token",
      },
    });

    expect(res.statusCode).toBe(200);
    expect(analyzer.runAnalysisPipeline).toHaveBeenCalledWith(
      "marcelroed",
      "gigatoken",
      expect.any(Function),
      {
        githubToken: "gh-provider-token",
        userId: "user-1",
        visibility: "private",
      },
    );
  });

  it("returns 401 when bearer token does not resolve to a user", async () => {
    vi.mocked(auth.getBearerToken).mockReturnValue("invalid-token");
    vi.mocked(supabase.getSupabaseUser).mockResolvedValue(null);
    vi.mocked(auth.getProviderToken).mockReturnValue("gh-token");
    vi.mocked(db.getWiki).mockResolvedValue(null);

    const app = buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/analyze",
      payload: { repoUrl: "https://github.com/marcelroed/gigatoken" },
      headers: {
        authorization: "Bearer invalid-token",
        "x-provider-token": "gh-token",
      },
    });

    expect(res.statusCode).toBe(401);
    expect(res.payload).toBe("Unathenticated");
  });

  it("returns 500 when repoGuard rejects access", async () => {
    vi.mocked(github.repoGuard).mockRejectedValue(new Error("Not found"));
    vi.mocked(db.getWiki).mockResolvedValue(null);

    const app = buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/analyze",
      payload: { repoUrl: "https://github.com/marcelroed/gigatoken" },
    });

    expect(res.statusCode).toBe(500);
  });
});
