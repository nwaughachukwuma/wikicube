"use client";

import { useEffect, useState, useCallback } from "react";
import { usePathname } from "next/navigation";
import type { Wiki, Feature } from "@/lib/types";
import WikiSidebar from "@/components/WikiSidebar";
import ChatPanel from "@/components/ChatPanel";
import AnalysisProgress from "@/components/AnalysisProgress";

interface WikiData {
  wiki: Wiki;
  features: Feature[];
}

export default function WikiShell({
  owner,
  repo,
  children,
}: {
  owner: string;
  repo: string;
  children: React.ReactNode;
}) {
  const [data, setData] = useState<WikiData | null>(null);
  const [loading, setLoading] = useState(true);
  const [needsGeneration, setNeedsGeneration] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    async function fetchWiki() {
      try {
        const res = await fetch(`/api/wiki/${owner}/${repo}`);
        if (res.ok) {
          const json = await res.json();
          if (json.wiki?.status === "done") {
            setData(json);
            setLoading(false);
            return;
          }
        }
        // Wiki doesn't exist or not done — need to generate
        setNeedsGeneration(true);
        setLoading(false);
      } catch {
        setNeedsGeneration(true);
        setLoading(false);
      }
    }
    fetchWiki();
  }, [owner, repo]);

  const handleAnalysisComplete = useCallback(() => {
    setNeedsGeneration(false);
    setLoading(true);
    fetch(`/api/wiki/${owner}/${repo}`)
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((json) => {
        if (json.wiki?.status === "done") {
          setData(json);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [owner, repo]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-3 h-3 bg-accent rounded-full animate-pulse" />
      </div>
    );
  }

  if (needsGeneration) {
    return (
      <AnalysisProgress
        owner={owner}
        repo={repo}
        onComplete={handleAnalysisComplete}
      />
    );
  }

  if (!data) return null;

  // Derive current page context from pathname + features list
  const basePath = `/wiki/${owner}/${repo}`;
  const pageContext = (() => {
    if (pathname === basePath || pathname === `${basePath}/`) {
      return [
        `Currently viewing: Overview page for ${owner}/${repo}`,
        data.wiki.overview ? `\n${data.wiki.overview.slice(0, 2000)}` : "",
      ].join("");
    }
    const featureSlug = pathname.replace(`${basePath}/`, "");
    const feature = data.features.find((f) => f.slug === featureSlug);
    if (feature) {
      return [
        `Currently viewing feature: ${feature.title}`,
        `\nSummary: ${feature.summary}`,
        feature.markdown_content
          ? `\n${feature.markdown_content.slice(0, 3000)}`
          : "",
      ].join("");
    }
    return undefined;
  })();

  return (
    <div className="min-h-screen flex">
      {/* Mobile sidebar toggle */}
      <button
        onClick={() => setSidebarOpen(!sidebarOpen)}
        className="fixed top-4 left-4 z-50 md:hidden p-2 bg-card border border-border"
        aria-label="Toggle sidebar"
      >
        <svg
          className="w-5 h-5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d={sidebarOpen ? "M6 18L18 6M6 6l12 12" : "M4 6h16M4 12h16M4 18h16"}
          />
        </svg>
      </button>

      {/* Sidebar */}
      <aside
        className={`fixed md:sticky top-0 left-0 h-screen w-64 border-r border-border bg-bg z-40
                     transform transition-transform md:translate-x-0
                     ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}`}
      >
        <WikiSidebar
          owner={owner}
          repo={repo}
          wikiId={data.wiki.id}
          features={data.features}
          onNavigate={() => setSidebarOpen(false)}
        />
      </aside>

      {/* Overlay for mobile sidebar */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/20 z-30 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main content */}
      <main className="flex-1 min-w-0">{children}</main>

      {/* Chat panel — pass current page context */}
      <ChatPanel wikiId={data.wiki.id} pageContext={pageContext} />
    </div>
  );
}
