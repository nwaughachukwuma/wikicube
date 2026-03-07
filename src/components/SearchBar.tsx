"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import Fuse from "fuse.js";
import { SearchIcon } from "lucide-react";
import type { Wiki, Feature } from "@/lib/types";

interface SearchResult {
  content: string;
  sourceType: string;
  sourceFile: string | null;
  similarity: number;
  featureTitle: string | null;
  featureSlug: string | null;
}

interface Props {
  owner: string;
  repo: string;
  wiki: Wiki;
  features?: Feature[];
  onNavigate?: () => void;
}

export default function SearchBar({
  owner,
  repo,
  wiki,
  features = [],
  onNavigate,
}: Props) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [semanticResults, setSemanticResults] = useState<SearchResult[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const wikiId = wiki.id;

  // Fuse.js fuzzy matcher on feature titles
  const fuse = useMemo(
    () =>
      new Fuse(features, {
        keys: [
          "title",
          "summary",
          "markdown_content",
          "entry_points.file",
          "citations.file",
        ],
        threshold: 0.4,
        includeScore: true,
      }),
    [features],
  );

  // Fuzzy results (instant, client-side)
  const fuzzyResults = useMemo(() => {
    if (!query.trim()) return [];
    return fuse.search(query).slice(0, 4);
  }, [query, fuse]);

  // Semantic results (debounced, server-side)
  useEffect(() => {
    if (!query.trim()) {
      setSemanticResults([]);
      setIsOpen(false);
      return;
    }

    // Open dropdown once semantic results arrive
    setIsOpen(false);

    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ wikiId, query }),
        });
        if (res.ok) {
          const data = await res.json();
          setSemanticResults(data.results || []);
        }
      } catch {
        // silently fail search
      } finally {
        setLoading(false);
        setIsOpen(true);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [query, wikiId]);

  // Merge fuzzy + semantic results, deduplicating by featureSlug
  const mergedResults = useMemo(() => {
    const seen = new Set<string>();
    const merged: Array<{
      featureTitle: string;
      featureSlug: string | null;
      content?: string;
      sourceFile?: string | null;
      source: "fuzzy" | "semantic";
    }> = [];

    // Fuzzy results first (instant, title matches)
    for (const r of fuzzyResults) {
      if (!seen.has(r.item.slug)) {
        seen.add(r.item.slug);
        merged.push({
          featureTitle: r.item.title,
          featureSlug: r.item.slug,
          source: "fuzzy",
        });
      }
    }

    // Then semantic results
    for (const r of semanticResults) {
      if (r.featureSlug) {
        if (seen.has(r.featureSlug)) continue;
        seen.add(r.featureSlug);
        merged.push({
          featureTitle: r.featureTitle || r.featureSlug,
          featureSlug: r.featureSlug,
          content: r.content,
          source: "semantic",
        });
      } else {
        // Code/overview chunks without a linked feature
        const key = r.sourceFile || r.content?.slice(0, 60) || "";
        if (seen.has(key)) continue;
        seen.add(key);
        merged.push({
          featureTitle: r.sourceFile
            ? r.sourceFile.split("/").pop() || r.sourceFile
            : "Overview",
          featureSlug: null,
          content: r.content,
          sourceFile: r.sourceFile,
          source: "semantic",
        });
      }
    }

    return merged.slice(0, 8);
  }, [fuzzyResults, semanticResults]);

  const hasResults = mergedResults.length > 0;

  return (
    <div className="relative">
      {wiki.search_error ? (
        <div className="mb-1.5 text-[10px] text-text-muted">
          Search indexing failed. You can still search by feature title.
        </div>
      ) : !wiki.search_ready ? (
        <div className="mb-1.5 flex items-center gap-1.5 text-[10px] text-text-muted">
          <div className="w-1.5 h-1.5 bg-accent rounded-full animate-pulse" />
          Search indexing in progress...
        </div>
      ) : null}
      <div className="flex items-center gap-2 border border-border px-2.5 py-1.5 bg-card">
        <SearchIcon className="w-3.5 h-3.5 text-text-muted shrink-0" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => hasResults && setIsOpen(true)}
          onBlur={() => setTimeout(() => setIsOpen(false), 200)}
          placeholder="Search wiki..."
          className="flex-1 text-xs bg-transparent focus:outline-none placeholder:text-text-muted/50"
        />
        {loading && (
          <div className="w-3 h-3 border border-text-muted border-t-transparent rounded-full animate-spin" />
        )}
      </div>

      {/* Results dropdown */}
      {isOpen && hasResults && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-card border border-border shadow-lg z-50 max-h-64 overflow-y-auto">
          {mergedResults.map((result, i) => (
            <button
              key={`${result.featureSlug || result.sourceFile || i}-${i}`}
              className="w-full text-left px-3 py-2 hover:bg-bg-alt transition border-b border-border last:border-0"
              onClick={() => {
                const target = result.featureSlug
                  ? `/wiki/${owner}/${repo}/${result.featureSlug}`
                  : `/wiki/${owner}/${repo}`;
                router.push(target);
                setQuery("");
                setIsOpen(false);
                onNavigate?.();
              }}
            >
              <div className="flex items-center gap-1.5">
                <div className="text-xs font-medium text-text truncate">
                  {result.featureTitle}
                </div>
                <span className="text-[9px] text-text-muted uppercase tracking-wider shrink-0">
                  {result.source === "fuzzy"
                    ? "title"
                    : result.featureSlug
                      ? "content"
                      : result.sourceFile
                        ? "code"
                        : "wiki"}
                </span>
              </div>
              {result.content && (
                <section className="text-[11px] text-text-muted mt-0.5 line-clamp-2">
                  {result.content.slice(0, 72)}
                </section>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
