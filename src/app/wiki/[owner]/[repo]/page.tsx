"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import MarkdownRenderer from "@/components/MarkdownRenderer";
import type { Wiki, Feature } from "@/lib/types";

export default function WikiOverviewPage() {
  const params = useParams<{ owner: string; repo: string }>();
  const { owner, repo } = params;
  const [wiki, setWiki] = useState<Wiki | null>(null);
  const [features, setFeatures] = useState<Feature[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const res = await fetch(`/api/wiki/${owner}/${repo}`);
      if (res.ok) {
        const data = await res.json();
        setWiki(data.wiki);
        setFeatures(data.features);
      }
      setLoading(false);
    }
    load();
  }, [owner, repo]);

  if (loading) {
    return (
      <div className="p-8 animate-pulse">
        <div className="h-8 bg-bg-alt w-64 mb-4" />
        <div className="h-4 bg-bg-alt w-96 mb-2" />
        <div className="h-4 bg-bg-alt w-80 mb-8" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 bg-bg-alt" />
          ))}
        </div>
      </div>
    );
  }

  if (!wiki) return null;

  return (
    <div className="max-w-4xl mx-auto px-6 md:px-10 py-10">
      {/* Overview header */}
      <div className="mb-10">
        <div className="text-xs uppercase tracking-widest text-text-muted mb-2">
          Wiki
        </div>
        <h1 className="font-display text-4xl md:text-5xl uppercase tracking-tight">
          {owner}/{repo}
        </h1>
      </div>

      {/* Overview content */}
      {wiki.overview && (
        <div className="mb-12">
          <MarkdownRenderer content={wiki.overview} />
        </div>
      )}

      {/* Feature cards */}
      <div className="mb-6">
        <h2 className="font-display text-2xl uppercase tracking-tight mb-6">
          Features
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {features.map((feature) => (
            <Link
              key={feature.id}
              href={`/wiki/${owner}/${repo}/${feature.slug}`}
              className="group block p-5 border border-border hover:border-border-strong
                         hover:bg-card transition"
            >
              <h3 className="font-display text-lg uppercase tracking-tight group-hover:text-text">
                {feature.title}
              </h3>
              <p className="mt-2 text-sm text-text-muted line-clamp-3">
                {feature.summary}
              </p>
              <span className="mt-3 inline-block text-xs uppercase tracking-wider text-text-muted group-hover:text-text transition">
                Read more →
              </span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
