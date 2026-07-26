import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Wiki } from "@shared/types.js";
import { buildApp } from "../app.js";
import * as db from "../services/db.js";
import * as auth from "../services/auth.js";
import * as supabase from "../services/supabase.js";
import * as queue from "../services/queue/index.js";
import * as reindexService from "../services/reindex.js";
import * as reindexUtils from "../utils/reindex.js";

vi.mock("../services/db.js", () => ({
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

vi.mock("../services/auth.js", () => ({
  getBearerToken: vi.fn(),
  getProviderToken: vi.fn(),
  adminRouteGuard: vi.fn(),
}));

vi.mock("../services/supabase.js", () => ({
  getServerClient: vi.fn(),
  getSupabaseUser: vi.fn(),
}));

vi.mock("../services/queue/index.js", () => ({
  queueJobs: vi.fn(),
}));

vi.mock("../services/reindex.js", () => ({
  reindexWikiAndCode: vi.fn(),
}));

vi.mock("../utils/reindex.js", () => ({
  reindexAllHandler: vi.fn(),
}));

const makeWiki = (overrides: Partial<Wiki> = {}) =>
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

function createSupabaseClient(result: { data?: any; error?: any } = {}) {
  return {
    from: () => ({
      select: () => ({
        eq: () => Promise.resolve(result),
      }),
    }),
  };
}

describe("POST /api/reindex", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(supabase.getServerClient).mockReturnValue(
      createSupabaseClient({ data: [], error: null }) as any,
    );
    vi.mocked(auth.getProviderToken).mockReturnValue(undefined);
    vi.mocked(reindexService.reindexWikiAndCode).mockResolvedValue("wiki-123");
  });

  it("returns 400 when owner or repo is missing", async () => {
    const app = buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/reindex",
      payload: { owner: "marcelroed" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("returns 404 when the wiki does not exist", async () => {
    vi.mocked(db.getWiki).mockResolvedValue(null);
    const app = buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/reindex",
      payload: { owner: "marcelroed", repo: "gigatoken" },
    });
    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.payload)).toEqual({ error: "Wiki not found" });
  });

  it("returns 400 when the wiki is not done", async () => {
    vi.mocked(db.getWiki).mockResolvedValue(makeWiki({ status: "pending" }));
    const app = buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/reindex",
      payload: { owner: "marcelroed", repo: "gigatoken" },
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.payload)).toEqual({
      error: "Wiki is not fully generated yet",
    });
  });

  it("reindexes a done wiki and returns 200", async () => {
    vi.mocked(db.getWiki).mockResolvedValue(makeWiki());
    const app = buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/reindex",
      payload: { owner: "marcelroed", repo: "gigatoken" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.payload).toBe("Reindexing completed");
    expect(reindexService.reindexWikiAndCode).toHaveBeenCalledWith(
      makeWiki(),
      undefined,
    );
  });

  it("returns 400 when reindexing fails", async () => {
    vi.mocked(db.getWiki).mockResolvedValue(makeWiki());
    vi.mocked(reindexService.reindexWikiAndCode).mockRejectedValue(
      new Error("Embedding failed"),
    );
    const app = buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/reindex",
      payload: { owner: "marcelroed", repo: "gigatoken" },
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.payload)).toEqual({ error: "Embedding failed" });
  });
});

describe("POST /api/reindex-all", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(supabase.getServerClient).mockReturnValue(
      createSupabaseClient({ data: [], error: null }) as any,
    );
    vi.mocked(queue.queueJobs).mockResolvedValue({ reindex: null } as any);
    vi.mocked(reindexUtils.reindexAllHandler).mockResolvedValue([
      { owner: "marcelroed", repo: "gigatoken", status: "ok", message: null },
    ]);
  });

  it("returns 403 when the user is not an admin", async () => {
    vi.mocked(auth.getBearerToken).mockReturnValue("bad-token");
    vi.mocked(auth.adminRouteGuard).mockResolvedValue(null);

    const app = buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/reindex-all",
      payload: {},
      headers: { authorization: "Bearer bad-token" },
    });
    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.payload)).toEqual({ error: "Forbidden" });
  });

  it("queues reindexing for all done wikis when a queue is available", async () => {
    const wikis = [makeWiki({ id: "wiki-1" }), makeWiki({ id: "wiki-2" })];
    vi.mocked(supabase.getServerClient).mockReturnValue(
      createSupabaseClient({ data: wikis, error: null }) as any,
    );
    vi.mocked(auth.getBearerToken).mockReturnValue("admin-token");
    vi.mocked(auth.adminRouteGuard).mockResolvedValue({
      id: "admin-1",
      email: "admin@example.com",
    } as any);
    vi.mocked(auth.getProviderToken).mockReturnValue("gh-token");

    const add = vi.fn();
    vi.mocked(queue.queueJobs).mockResolvedValue({
      reindex: { add },
    } as any);

    const app = buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/reindex-all",
      payload: {},
      headers: {
        authorization: "Bearer admin-token",
        "x-provider-token": "gh-token",
      },
    });

    expect(res.statusCode).toBe(200);
    expect(res.payload).toBe("Reindex-all operation is queued");
    expect(add).toHaveBeenCalledWith("reindex-all", {
      wikis,
      githubToken: "gh-token",
    });
  });

  it("runs reindexing inline when no queue is available", async () => {
    const wikis = [makeWiki({ id: "wiki-1" })];
    vi.mocked(supabase.getServerClient).mockReturnValue(
      createSupabaseClient({ data: wikis, error: null }) as any,
    );
    vi.mocked(auth.getBearerToken).mockReturnValue("admin-token");
    vi.mocked(auth.adminRouteGuard).mockResolvedValue({
      id: "admin-1",
      email: "admin@example.com",
    } as any);
    vi.mocked(auth.getProviderToken).mockReturnValue("gh-token");

    const app = buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/reindex-all",
      payload: {},
      headers: {
        authorization: "Bearer admin-token",
        "x-provider-token": "gh-token",
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.results).toEqual([
      { owner: "marcelroed", repo: "gigatoken", status: "ok", message: null },
    ]);
    expect(reindexUtils.reindexAllHandler).toHaveBeenCalledWith(
      wikis,
      "gh-token",
    );
  });

  it("returns 500 when fetching wikis fails", async () => {
    vi.mocked(supabase.getServerClient).mockReturnValue(
      createSupabaseClient({
        data: null,
        error: { message: "Supabase down" },
      }) as any,
    );
    vi.mocked(auth.getBearerToken).mockReturnValue("admin-token");
    vi.mocked(auth.adminRouteGuard).mockResolvedValue({
      id: "admin-1",
      email: "admin@example.com",
    } as any);

    const app = buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/reindex-all",
      payload: {},
      headers: { authorization: "Bearer admin-token" },
    });

    expect(res.statusCode).toBe(500);
    expect(JSON.parse(res.payload)).toEqual({ error: "Supabase down" });
  });
});

describe("POST /api/queue/healthcheck", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 400 when the queue is not available", async () => {
    vi.mocked(queue.queueJobs).mockResolvedValue({ reindex: null } as any);
    const app = buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/queue/healthcheck",
      payload: {},
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.payload)).toEqual({ ok: false });
  });

  it("returns 200 when the queue can accept jobs", async () => {
    const addBulk = vi.fn();
    vi.mocked(queue.queueJobs).mockResolvedValue({
      reindex: { addBulk },
    } as any);
    const app = buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/queue/healthcheck",
      payload: {},
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload)).toEqual({ ok: true });
    expect(addBulk).toHaveBeenCalled();
  });
});
