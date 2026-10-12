import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Wiki } from "@shared/types.js";
import * as github from "@shared/github.js";
import { buildApp } from "../../src/app.js";
import * as db from "../../src/services/db.js";
import * as auth from "../../src/services/auth.js";
import * as supabase from "../../src/services/supabase.js";
import * as refresh from "../../src/services/refresh.js";

vi.mock("@shared/github.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@shared/github.js")>()),
  repoGuard: vi.fn(),
}));

vi.mock("../../src/services/db.js", () => ({
  getWiki: vi.fn(),
  claimRefresh: vi.fn(),
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

vi.mock("../../src/services/refresh.js", () => ({
  runRefresh: vi.fn(),
}));

vi.mock("../../src/services/queue/index.js", () => ({
  queueJobs: vi.fn(),
}));

const makeWiki = (overrides: Partial<Wiki> = {}) =>
  ({
    id: "wiki-1",
    owner: "o",
    repo: "r",
    status: "done",
    visibility: "private",
    generation: 0,
    ...overrides,
  }) as Wiki;

const user = (email: string) => ({ id: "user-1", email }) as any;

async function postRefresh() {
  return buildApp().inject({
    method: "POST",
    url: "/api/refresh",
    payload: { owner: "o", repo: "r" },
  });
}

describe("POST /api/refresh", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ADMIN_EMAILS = "admin@example.com";
    vi.mocked(supabase.getSupabaseUser).mockResolvedValue(
      user("dev@example.com"),
    );
    vi.mocked(auth.getProviderToken).mockReturnValue("gh-token");
    vi.mocked(github.repoGuard).mockResolvedValue({} as Response);
    vi.mocked(db.getWiki).mockResolvedValue(makeWiki());
    vi.mocked(db.claimRefresh).mockImplementation(async () => makeWiki());
    vi.mocked(refresh.runRefresh).mockResolvedValue(undefined);
  });

  it("requires a signed-in user", async () => {
    vi.mocked(supabase.getSupabaseUser).mockResolvedValue(null);
    expect((await postRefresh()).statusCode).toBe(401);
  });

  it("starts a refresh of a private wiki the user can read", async () => {
    const res = await postRefresh();

    expect(res.statusCode).toBe(202);
    expect(github.repoGuard).toHaveBeenCalledWith("o", "r", "gh-token");
    expect(refresh.runRefresh).toHaveBeenCalledWith(makeWiki(), "gh-token");
  });

  it("rejects users without GitHub access to the private repo", async () => {
    vi.mocked(github.repoGuard).mockRejectedValue(new Error("404"));

    expect((await postRefresh()).statusCode).toBe(403);
    expect(db.claimRefresh).not.toHaveBeenCalled();
  });

  it("leaves public wikis to the schedule for non-admins", async () => {
    vi.mocked(db.getWiki).mockResolvedValue(makeWiki({ visibility: "public" }));

    expect((await postRefresh()).statusCode).toBe(403);
  });

  it("lets admins refresh public wikis", async () => {
    vi.mocked(supabase.getSupabaseUser).mockResolvedValue(
      user("admin@example.com"),
    );
    vi.mocked(db.getWiki).mockResolvedValue(makeWiki({ visibility: "public" }));

    expect((await postRefresh()).statusCode).toBe(202);
    expect(github.repoGuard).not.toHaveBeenCalled();
  });

  it("returns 409 while another refresh holds the lock", async () => {
    vi.mocked(db.claimRefresh).mockResolvedValue(null);

    const res = await postRefresh();
    expect(res.statusCode).toBe(409);
    expect(refresh.runRefresh).not.toHaveBeenCalled();
  });
});
