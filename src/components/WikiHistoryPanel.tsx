"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import Fuse from "fuse.js";
import { PanelLeft, X, BookOpen, SearchIcon } from "lucide-react";
import { OptimLink } from "@/components/OptimisticLink";
import { fetchWithSWR } from "@/lib/cache.client";
import { segmentByTime } from "@/lib/timing";
import type { WikiEntry } from "@shared/types";

export default function WikiHistoryPanel() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [wikis, setWikis] = useState<WikiEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Prefetch on mount
  useEffect(() => {
    let cancelled = false;
    fetchWithSWR<WikiEntry[]>("/api/wikis", {}, {
      maxAge: 300,
      onRevalidate: (data) => !cancelled && setWikis(data),
    })
      .then((data) => !cancelled && setWikis(data))
      .catch(() => !cancelled && setWikis([]))
      .finally(() => !cancelled && setLoading(false));

    return () => {
      cancelled = true;
    };
  }, []);

  // Focus search on open, but skip touch devices where the keyboard would cover the list
  useEffect(() => {
    if (open && window.matchMedia("(pointer: fine)").matches) {
      inputRef.current?.focus();
    }
  }, [open]);

  // Keyword search with light typo tolerance: space-separated terms are ANDed,
  // each matched fuzzily anywhere in owner, repo, or "owner/repo"
  const fuse = useMemo(
    () =>
      new Fuse(wikis, {
        keys: [
          { name: "repo", weight: 2 },
          { name: "owner", weight: 1 },
          {
            name: "fullName",
            weight: 1,
            getFn: (w) => `${w.owner}/${w.repo}`,
          },
        ],
        threshold: 0.3,
        ignoreLocation: true,
        useExtendedSearch: true,
      }),
    [wikis],
  );

  const trimmedQuery = query.trim();
  const results = useMemo(
    () =>
      trimmedQuery ? fuse.search(trimmedQuery).map((r) => r.item) : null,
    [fuse, trimmedQuery],
  );

  const groups = useMemo(() => segmentByTime(wikis), [wikis]);

  const close = () => {
    setOpen(false);
    setQuery("");
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      if (query) setQuery("");
      else close();
    } else if (e.key === "Enter" && results?.[0]) {
      router.push(`/wiki/${results[0].owner}/${results[0].repo}`);
      close();
    }
  };

  const renderWikiLink = (wiki: WikiEntry) => (
    <li key={wiki.id}>
      <OptimLink
        href={`/wiki/${wiki.owner}/${wiki.repo}`}
        onClick={close}
        className="block px-3 py-2 rounded text-sm font-mono
          hover:bg-bg-alt transition truncate"
      >
        <span className="text-text-muted">{wiki.owner}/</span>
        <span className="text-text font-medium">{wiki.repo}</span>
      </OptimLink>
    </li>
  );

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
          onClick={close}
        />
      )}

      {/* Slide-out panel */}
      <div
        className={`fixed top-0 left-0 h-full w-80 bg-card border-r border-border z-50
          flex flex-col transform transition-transform duration-200 ease-out
          ${open ? "translate-x-0" : "-translate-x-full"}`}
      >
        {/* Panel header */}
        <div className="flex items-center justify-between px-4 py-4 border-b border-border shrink-0">
          <h2 className="font-display text-sm uppercase tracking-wide">
            Generated Wikis
          </h2>
          <button
            onClick={close}
            className="p-1 rounded hover:bg-bg-alt transition text-text-muted hover:text-text"
            aria-label="Close panel"
          >
            <X size={18} />
          </button>
        </div>

        {/* Search — pinned above the scrolling list */}
        {(loading || wikis.length > 0) && (
          <div className="px-4 py-3 border-b border-border shrink-0">
            <div
              className="flex items-center gap-2 border border-border px-2.5 py-1.5 bg-bg
                focus-within:border-border-strong transition"
            >
              <SearchIcon className="w-3.5 h-3.5 text-text-muted shrink-0" />
              <input
                ref={inputRef}
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Search repos..."
                aria-label="Search repos"
                className="flex-1 min-w-0 text-sm bg-transparent focus:outline-none
                  placeholder:text-text-muted/50
                  [&::-webkit-search-cancel-button]:appearance-none"
              />
              {query && (
                <button
                  onClick={() => {
                    setQuery("");
                    inputRef.current?.focus();
                  }}
                  className="p-0.5 rounded text-text-muted hover:text-text transition"
                  aria-label="Clear search"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          </div>
        )}

        {/* Panel body */}
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 py-3">
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

          {!loading && results && results.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-text-muted text-center">
              <SearchIcon size={28} className="mb-3 opacity-40" />
              <p className="text-sm">No repos match</p>
              <p className="text-xs mt-1 opacity-70 font-mono break-all">
                &ldquo;{trimmedQuery}&rdquo;
              </p>
            </div>
          )}

          {!loading && results && results.length > 0 && (
            <div className="mb-5">
              <p className="text-[11px] uppercase tracking-widest text-text-muted mb-2 font-medium">
                {results.length} {results.length === 1 ? "result" : "results"}
              </p>
              <ul className="space-y-1">{results.map(renderWikiLink)}</ul>
            </div>
          )}

          {!loading &&
            !results &&
            groups.map((group) => (
              <div key={group.label} className="mb-5">
                <p className="text-[11px] uppercase tracking-widest text-text-muted mb-2 font-medium">
                  {group.label}
                </p>
                <ul className="space-y-1">{group.wikis.map(renderWikiLink)}</ul>
              </div>
            ))}
        </div>
      </div>
    </>
  );
}
