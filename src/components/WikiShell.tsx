"use client";

import { useEffect, useState, useCallback } from "react";
import { usePathname } from "next/navigation";
import WikiSidebar from "@/components/WikiSidebar";
import ChatPanel from "@/components/ChatPanel";
import AnalysisProgress from "@/components/AnalysisProgress";
import { PageLoading } from "./PageLoading";
import { WikiData, wikiStore } from "@/lib/stores/wikiStore";
import { useMounted } from "@/lib/hooks/mounted";

export default function WikiShell({
  owner,
  repo,
  children,
}: {
  owner: string;
  repo: string;
  children: React.ReactNode;
}) {
  const [loading, setLoading] = useState(true);
  const [needsGeneration, setNeedsGeneration] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const pathname = usePathname();
  const { getWikiData, data, pollWikiData } = wikiStore();
  const { mounted } = useMounted();

  const basePath = `/wiki/${owner}/${repo}`;

  useEffect(() => {
    getWikiData(owner, repo)
      .then((res) => !res && setNeedsGeneration(true))
      .catch((err) => {
        console.error("Failed to fetch wiki data", err);
        setNeedsGeneration(true);
      })
      .finally(() => setLoading(false));
  }, [owner, repo, getWikiData]);

  const handleAnalysisComplete = useCallback(() => {
    setNeedsGeneration(false);
    setLoading(true);
    getWikiData(owner, repo)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [owner, repo, getWikiData]);

  // Poll for search_ready when wiki is done but search index isn't built yet
  useEffect(() => {
    if (!data || data.wiki.search_ready) return;
    const unsubscribe = pollWikiData(owner, repo);
    return () => unsubscribe();
  }, [data, owner, repo, pollWikiData]);

  function getPageContext(data: WikiData | null) {
    if (!data) return undefined;
    if (pathname === basePath || pathname === `${basePath}/`) {
      return [
        `Currently viewing: Overview page for ${owner}/${repo}`,
        data.wiki.overview ? `\n${data.wiki.overview}` : "", // .slice(0, 2000)
      ].join("");
    }
    const featureSlug = pathname.replace(`${basePath}/`, "");
    const feature = data.features.find((f) => f.slug === featureSlug);
    // TODO: review
    if (feature) {
      return [
        `Currently viewing feature: ${feature.title}`,
        `\nSummary: ${feature.summary}`,
        feature.markdown_content
          ? `\n${feature.markdown_content}` //.slice(0, 3000)}`
          : "",
      ].join("");
    }
    return undefined;
  }

  if (loading || !mounted) {
    return <PageLoading />;
  } else if (needsGeneration) {
    return (
      <AnalysisProgress
        owner={owner}
        repo={repo}
        onComplete={handleAnalysisComplete}
      />
    );
  } else if (!data) return null;

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
          searchReady={data.wiki.search_ready}
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
      <ChatPanel
        wikiId={data.wiki.id}
        pageContext={getPageContext(data)}
        searchReady={data.wiki.search_ready}
      />
    </div>
  );
}
