"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

interface SearchResult {
  content: string;
  sourceType: string;
  sourceFile: string | null;
  similarity: number;
  featureTitle: string | null;
  featureSlug: string | null;
}

interface Props {
  wikiId: string;
  owner: string;
  repo: string;
  onNavigate?: () => void;
}

export default function SearchBar({ wikiId, owner, repo, onNavigate }: Props) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      setIsOpen(false);
      return;
    }

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
          setResults(data.results || []);
          setIsOpen(true);
        }
      } catch {
        // silently fail search
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [query, wikiId]);

  return (
    <div className="relative">
      <div className="flex items-center gap-2 border border-border px-2.5 py-1.5 bg-card">
        <svg
          className="w-3.5 h-3.5 text-text-muted flex-shrink-0"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => results.length > 0 && setIsOpen(true)}
          onBlur={() => setTimeout(() => setIsOpen(false), 200)}
          placeholder="Search wiki..."
          className="flex-1 text-xs bg-transparent focus:outline-none placeholder:text-text-muted/50"
        />
        {loading && (
          <div className="w-3 h-3 border border-text-muted border-t-transparent rounded-full animate-spin" />
        )}
      </div>

      {/* Results dropdown */}
      {isOpen && results.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-card border border-border shadow-lg z-50 max-h-64 overflow-y-auto">
          {results.map((result, i) => (
            <button
              key={i}
              className="w-full text-left px-3 py-2 hover:bg-bg-alt transition border-b border-border last:border-0"
              onClick={() => {
                if (result.featureSlug) {
                  router.push(`/wiki/${owner}/${repo}/${result.featureSlug}`);
                  setQuery("");
                  setIsOpen(false);
                  onNavigate?.();
                }
              }}
            >
              {result.featureTitle && (
                <div className="text-xs font-medium text-text">
                  {result.featureTitle}
                </div>
              )}
              <div className="text-[11px] text-text-muted mt-0.5 line-clamp-2">
                {result.content}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
