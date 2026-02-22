"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import MarkdownRenderer from "@/components/MarkdownRenderer";
import TableOfContents from "@/components/TableOfContents";
import type { Feature } from "@/lib/types";

export default function FeaturePage() {
  const params = useParams<{
    owner: string;
    repo: string;
    featureSlug: string;
  }>();
  const { owner, repo, featureSlug } = params;
  const [feature, setFeature] = useState<Feature | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const res = await fetch(`/api/wiki/${owner}/${repo}`);
      if (res.ok) {
        const data = await res.json();
        const features = data.features as Feature[];
        const found = features.find((f) => f.slug === featureSlug);

        if (found) setFeature(found);
      }
      setLoading(false);
    }
    load();
  }, [owner, repo, featureSlug]);

  if (loading) {
    return (
      <div className="p-8 animate-pulse">
        <div className="h-8 bg-bg-alt w-64 mb-4" />
        <div className="h-4 bg-bg-alt w-full mb-2" />
        <div className="h-4 bg-bg-alt w-5/6 mb-2" />
        <div className="h-4 bg-bg-alt w-4/6 mb-8" />
      </div>
    );
  }

  if (!feature) {
    return (
      <div className="p-8">
        <h1 className="font-display text-2xl uppercase">Feature Not Found</h1>
        <p className="mt-2 text-text-muted">
          The feature &ldquo;{featureSlug}&rdquo; was not found in this wiki.
        </p>
      </div>
    );
  }

  return (
    <div className="flex">
      {/* Main content */}
      <div className="flex-1 min-w-0 max-w-4xl mx-auto px-6 md:px-10 py-10">
        {/* Breadcrumb */}
        <div className="text-xs uppercase tracking-widest text-text-muted mb-2">
          {owner}/{repo}
        </div>

        {/* Title */}
        <h1 className="font-display text-3xl md:text-4xl uppercase tracking-tight mb-2">
          {feature.title}
        </h1>
        <p className="text-text-muted mb-8">{feature.summary}</p>

        {/* Entry points */}
        {feature.entry_points && feature.entry_points.length > 0 && (
          <div className="mb-8 p-4 border border-border bg-card">
            <h3 className="text-xs uppercase tracking-widest text-text-muted mb-3">
              Key Entry Points
            </h3>
            <div className="space-y-1.5">
              {feature.entry_points.map((ep, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  <code className="font-mono text-xs bg-code-bg px-1.5 py-0.5">
                    {ep.symbol}
                  </code>
                  <span className="text-text-muted">in</span>
                  <a
                    href={ep.githubUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="citation-link"
                  >
                    {ep.file}#L{ep.line}
                  </a>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Wiki content */}
        <MarkdownRenderer content={feature.markdown_content} />
      </div>

      {/* Table of contents — desktop only */}
      <div className="hidden xl:block w-56 shrink-0">
        <div className="sticky top-8 py-10 pr-4">
          <TableOfContents content={feature.markdown_content} />
        </div>
      </div>
    </div>
  );
}
