"use client";

import { useEffect, useState, useMemo } from "react";
import { PanelLeft, X, BookOpen } from "lucide-react";
import { OptimLink } from "@/components/OptimisticLink";

interface WikiEntry {
  id: string;
  owner: string;
  repo: string;
  status: string;
  created_at: string;
  updated_at: string;
}

interface TimeGroup {
  label: string;
  wikis: WikiEntry[];
}

function segmentByTime(wikis: WikiEntry[]): TimeGroup[] {
  const now = new Date();

  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);

  const startOfYesterday = new Date(startOfToday);
  startOfYesterday.setDate(startOfYesterday.getDate() - 1);

  // Start of this week (Monday)
  const startOfThisWeek = new Date(startOfToday);
  const dayOfWeek = startOfToday.getDay();
  const diffToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  startOfThisWeek.setDate(startOfThisWeek.getDate() - diffToMonday);

  const startOfLastWeek = new Date(startOfThisWeek);
  startOfLastWeek.setDate(startOfLastWeek.getDate() - 7);

  // Start of this month
  const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  // Start of last month
  const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

  const buckets: Record<string, WikiEntry[]> = {
    Today: [],
    Yesterday: [],
    "This Week": [],
    "Last Week": [],
    "This Month": [],
    "Last Month": [],
    Older: [],
  };

  for (const wiki of wikis) {
    const d = new Date(wiki.updated_at);

    if (d >= startOfToday) {
      buckets["Today"].push(wiki);
    } else if (d >= startOfYesterday) {
      buckets["Yesterday"].push(wiki);
    } else if (d >= startOfThisWeek) {
      buckets["This Week"].push(wiki);
    } else if (d >= startOfLastWeek) {
      buckets["Last Week"].push(wiki);
    } else if (d >= startOfThisMonth) {
      buckets["This Month"].push(wiki);
    } else if (d >= startOfLastMonth) {
      buckets["Last Month"].push(wiki);
    } else {
      buckets["Older"].push(wiki);
    }
  }

  return Object.entries(buckets)
    .filter(([, items]) => items.length > 0)
    .map(([label, items]) => ({ label, wikis: items }));
}

export default function WikiHistoryPanel() {
  const [open, setOpen] = useState(false);
  const [wikis, setWikis] = useState<WikiEntry[]>([]);
  const [loading, setLoading] = useState(true);

  // Prefetch on mount
  useEffect(() => {
    let cancelled = false;

    fetch("/api/wikis")
      .then((r) => r.json())
      .then((data: WikiEntry[]) => {
        if (!cancelled) setWikis(data);
      })
      .catch(() => {
        if (!cancelled) setWikis([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const groups = useMemo(() => segmentByTime(wikis), [wikis]);

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setOpen(true)}
        className="p-2 rounded hover:bg-bg-alt transition text-text-muted hover:text-text"
        aria-label="Open wiki history"
      >
        <PanelLeft size={20} />
      </button>

      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 bg-black/20 z-40 transition-opacity"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Slide-out panel */}
      <div
        className={`fixed top-0 left-0 h-full w-80 bg-card border-r border-border z-50
          transform transition-transform duration-200 ease-out
          ${open ? "translate-x-0" : "-translate-x-full"}`}
      >
        {/* Panel header */}
        <div className="flex items-center justify-between px-4 py-4 border-b border-border">
          <h2 className="font-display text-sm uppercase tracking-wide">
            Generated Wikis
          </h2>
          <button
            onClick={() => setOpen(false)}
            className="p-1 rounded hover:bg-bg-alt transition text-text-muted hover:text-text"
            aria-label="Close panel"
          >
            <X size={18} />
          </button>
        </div>

        {/* Panel body */}
        <div className="overflow-y-auto h-[calc(100%-57px)] px-4 py-3">
          {loading && (
            <div className="flex items-center gap-2 text-sm text-text-muted py-8 justify-center">
              <span className="animate-pulse">Loading…</span>
            </div>
          )}

          {!loading && wikis.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-text-muted">
              <BookOpen size={32} className="mb-3 opacity-40" />
              <p className="text-sm">No wikis generated yet</p>
              <p className="text-xs mt-1 opacity-70">
                Paste a GitHub URL above to get started
              </p>
            </div>
          )}

          {!loading &&
            groups.map((group) => (
              <div key={group.label} className="mb-5">
                <p className="text-[11px] uppercase tracking-widest text-text-muted mb-2 font-medium">
                  {group.label}
                </p>
                <ul className="space-y-1">
                  {group.wikis.map((wiki) => (
                    <li key={wiki.id}>
                      <OptimLink
                        href={`/wiki/${wiki.owner}/${wiki.repo}`}
                        onClick={() => setOpen(false)}
                        className="block px-3 py-2 rounded text-sm font-mono
                          hover:bg-bg-alt transition truncate"
                      >
                        <span className="text-text-muted">{wiki.owner}/</span>
                        <span className="text-text font-medium">
                          {wiki.repo}
                        </span>
                      </OptimLink>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
        </div>
      </div>
    </>
  );
}
