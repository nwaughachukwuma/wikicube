import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import type { WikiEntry } from "@shared/types";
import { timeAgo, dayAgo, segmentByTime } from "@/lib/timing";

describe("timeAgo", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns "just now" for dates under a minute', () => {
    vi.setSystemTime("2024-01-01T00:00:59Z");
    expect(timeAgo("2024-01-01T00:00:30Z")).toBe("just now");
  });

  it('returns "5m ago" for a few minutes', () => {
    vi.setSystemTime("2024-01-01T00:05:00Z");
    expect(timeAgo("2024-01-01T00:00:00Z")).toBe("5m ago");
  });

  it('returns "3h ago" for a few hours', () => {
    vi.setSystemTime("2024-01-01T03:00:00Z");
    expect(timeAgo("2024-01-01T00:00:00Z")).toBe("3h ago");
  });

  it('returns "yesterday" for one day', () => {
    vi.setSystemTime("2024-01-02T00:00:00Z");
    expect(timeAgo("2024-01-01T00:00:00Z")).toBe("yesterday");
  });

  it('returns "6d ago" for less than a week', () => {
    vi.setSystemTime("2024-01-07T00:00:00Z");
    expect(timeAgo("2024-01-01T00:00:00Z")).toBe("6d ago");
  });
});

describe("dayAgo", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns "today" for same day', () => {
    vi.setSystemTime("2024-01-01T00:00:00Z");
    expect(dayAgo("2024-01-01T00:00:00Z")).toBe("today");
  });

  it('returns "yesterday" for one day', () => {
    vi.setSystemTime("2024-01-02T00:00:00Z");
    expect(dayAgo("2024-01-01T00:00:00Z")).toBe("yesterday");
  });

  it('returns "14d ago" for less than a month', () => {
    vi.setSystemTime("2024-01-15T00:00:00Z");
    expect(dayAgo("2024-01-01T00:00:00Z")).toBe("14d ago");
  });

  it('returns "2mo ago" for less than a year', () => {
    vi.setSystemTime("2024-03-01T00:00:00Z");
    expect(dayAgo("2024-01-01T00:00:00Z")).toBe("2mo ago");
  });

  it('returns "1y ago" for one year', () => {
    vi.setSystemTime("2025-01-01T00:00:00Z");
    expect(dayAgo("2024-01-01T00:00:00Z")).toBe("1y ago");
  });
});

describe("segmentByTime", () => {
  it("groups wikis into time buckets", () => {
    const now = new Date("2024-01-17T12:00:00Z");
    vi.setSystemTime(now);

    const wikis = [
      { id: "1", updated_at: "2024-01-17T10:00:00Z" },
      { id: "2", updated_at: "2024-01-16T10:00:00Z" },
      { id: "3", updated_at: "2024-01-15T10:00:00Z" },
      { id: "4", updated_at: "2024-01-08T10:00:00Z" },
    ] as unknown as WikiEntry[];

    const groups = segmentByTime(wikis);
    const labels = groups.map((g) => g.label);

    expect(labels).toContain("Today");
    expect(labels).toContain("Yesterday");
    expect(labels).toContain("This Week");
    expect(labels).toContain("Last Week");
    expect(groups.find((g) => g.label === "Today")?.wikis).toHaveLength(1);
    expect(groups.find((g) => g.label === "Yesterday")?.wikis).toHaveLength(1);
    expect(groups.find((g) => g.label === "This Week")?.wikis).toHaveLength(1);
    expect(groups.find((g) => g.label === "Last Week")?.wikis).toHaveLength(1);

    vi.useRealTimers();
  });
});
