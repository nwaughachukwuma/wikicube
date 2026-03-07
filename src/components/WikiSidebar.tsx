"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Feature, Wiki } from "@/lib/types";
import SearchBar from "@/components/SearchBar";
import WikiHistoryPanel from "@/components/WikiHistoryPanel";
import { OptimLink } from "./OptimisticLink";

interface Props {
  owner: string;
  repo: string;
  wiki: Wiki;
  features: Feature[];
  onNavigate?: () => void;
}

export default function WikiSidebar({
  owner,
  repo,
  wiki,
  features,
  onNavigate,
}: Props) {
  const pathname = usePathname();
  const basePath = `/wiki/${owner}/${repo}`;
  const wikiId = wiki.id;

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-border">
        <div className="flex items-center justify-between">
          <Link
            href="/"
            className="text-xs uppercase tracking-widest text-text-muted hover:text-text transition"
          >
            WikiCube
          </Link>
          <WikiHistoryPanel />
        </div>
        <Link
          href={basePath}
          className="mt-2 block font-mono text-sm font-medium hover:text-text-muted transition"
          onClick={onNavigate}
        >
          {owner}/{repo}
        </Link>
      </div>

      {/* Search */}
      <div className="p-3 border-b border-border">
        <SearchBar
          owner={owner}
          repo={repo}
          wiki={wiki}
          features={features}
          onNavigate={onNavigate}
        />
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto p-3 space-y-0.5">
        <OptimLink
          href={basePath}
          onClick={onNavigate}
          className={`block px-3 py-2 text-sm transition rounded-sm ${
            pathname === basePath
              ? "bg-accent/30 text-text font-medium"
              : "text-text-muted hover:text-text hover:bg-bg-alt"
          }`}
        >
          Overview
        </OptimLink>

        <div className="pt-3 pb-1 px-3">
          <span className="text-[10px] uppercase tracking-widest text-text-muted">
            Features
          </span>
        </div>

        {features.map((feature) => {
          const featurePath = `${basePath}/${feature.slug}`;
          const isActive = pathname === featurePath;

          return (
            <OptimLink
              key={feature.id}
              href={featurePath}
              onClick={onNavigate}
              className={`block px-3 py-2 text-sm transition rounded-sm ${
                isActive
                  ? "bg-accent/30 text-text font-medium"
                  : "text-text-muted hover:text-text hover:bg-bg-alt"
              }`}
            >
              {feature.title}
            </OptimLink>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="p-3 border-t border-border text-[10px] text-text-muted">
        <a
          href={`https://github.com/${owner}/${repo}`}
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-text transition"
        >
          View on GitHub ↗
        </a>
      </div>
    </div>
  );
}
