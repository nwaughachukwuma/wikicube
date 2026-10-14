import { describe, it, expect } from "vitest";
import { isRefreshing, REFRESH_LOCK_TTL_MS } from "@shared/constants";

describe("isRefreshing", () => {
  const now = Date.parse("2026-10-14T12:00:00Z");
  const startedAgo = (ms: number) => ({
    refresh_started_at: new Date(now - ms).toISOString(),
  });

  it("is false without a lock", () => {
    expect(isRefreshing({ refresh_started_at: null }, now)).toBe(false);
  });

  it("is true while the lock is fresh", () => {
    expect(isRefreshing(startedAgo(60_000), now)).toBe(true);
  });

  it("ignores a lock left behind by a run that died", () => {
    expect(isRefreshing(startedAgo(REFRESH_LOCK_TTL_MS + 1), now)).toBe(false);
  });
});
