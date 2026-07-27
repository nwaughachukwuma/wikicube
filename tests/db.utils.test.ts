import type { Session, User } from "@supabase/supabase-js";
import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  canAccessRepo,
  validateRepoAccess,
  authRouteGuard,
  withRetry,
} from "@/lib/db.utils";
import * as supabase from "@/lib/supabase/server";
import * as github from "@shared/github";
import pRetry from "p-retry";

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseSession: vi.fn(),
  getSupabaseUser: vi.fn(),
}));

vi.mock("@shared/github", () => ({
  repoGuard: vi.fn(),
}));

vi.mock("p-retry", () => ({
  default: vi.fn((run) => run()),
}));

describe("canAccessRepo", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns true when repoGuard resolves", async () => {
    vi.mocked(supabase.getSupabaseSession).mockResolvedValue({
      provider_token: "token",
    } as unknown as Session);
    vi.mocked(github.repoGuard).mockResolvedValue({ ok: true } as unknown as Response);

    const result = await canAccessRepo("owner", "repo");

    expect(result).toBe(true);
    expect(github.repoGuard).toHaveBeenCalledWith("owner", "repo", "token");
  });

  it("returns false when repoGuard rejects", async () => {
    vi.mocked(supabase.getSupabaseSession).mockResolvedValue(null);
    vi.mocked(github.repoGuard).mockRejectedValue(new Error("not found"));

    const result = await canAccessRepo("owner", "repo");

    expect(result).toBe(false);
  });
});

describe("validateRepoAccess", () => {
  it("returns undefined when access is allowed", async () => {
    vi.mocked(supabase.getSupabaseSession).mockResolvedValue(null);
    vi.mocked(github.repoGuard).mockResolvedValue({ ok: true } as unknown as Response);

    const result = await validateRepoAccess("owner", "repo");
    expect(result).toBeUndefined();
  });

  it("returns a 403 response when access is denied", async () => {
    vi.mocked(supabase.getSupabaseSession).mockResolvedValue(null);
    vi.mocked(github.repoGuard).mockRejectedValue(new Error("forbidden"));

    const response = await validateRepoAccess("owner", "repo");
    expect(response?.status).toBe(403);
    const json = await response?.json();
    expect(json).toEqual({ error: "You do not have access to this wiki" });
  });
});

describe("authRouteGuard", () => {
  it("returns user and no error when authenticated", async () => {
    const user = { id: "user-1" } as unknown as User;
    vi.mocked(supabase.getSupabaseUser).mockResolvedValue(user);

    const result = await authRouteGuard();
    expect(result.user).toBe(user);
    expect(result.err).toBeNull();
  });

  it("returns a 401 response when unauthenticated", async () => {
    vi.mocked(supabase.getSupabaseUser).mockResolvedValue(null);

    const result = await authRouteGuard("Please log in");
    expect(result.user).toBeNull();
    expect(result.err?.status).toBe(401);
    const json = await result.err?.json();
    expect(json).toEqual({ error: "Please log in" });
  });
});

describe("withRetry", () => {
  it("returns the result of a successful operation", async () => {
    const result = await withRetry("fetch", async () => "ok");
    expect(result).toBe("ok");
  });

  it("throws when the operation fails", async () => {
    vi.mocked(pRetry).mockImplementationOnce(async (run) => {
      try {
        return await (run as () => Promise<unknown>)();
      } catch (err) {
        throw err;
      }
    });

    await expect(
      withRetry("fetch", async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
  });
});
