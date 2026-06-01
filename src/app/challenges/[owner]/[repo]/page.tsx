"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { useEffect, useState, useCallback } from "react";
import {
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  Copy,
  Check,
  ArrowLeft,
  Loader2,
  RefreshCw,
} from "lucide-react";
import type { Challenge } from "@shared/types";
import { LinkifyGitHubRefs } from "./LinkifyGitHubRefs";

const PREVIEW_LENGTH = 240;
const OBJECTIVE_PREVIEW_LENGTH = 100;
const PAGE_SIZE = 10;

// Most recent first
const byRecency = (a: Challenge, b: Challenge) =>
  new Date(b.created_at).getTime() - new Date(a.created_at).getTime();

function ChallengeCard({
  challenge,
  index,
  owner,
  repo,
}: {
  challenge: Challenge;
  index: number;
  owner: string;
  repo: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const fullContent = [
    `## Role\n${challenge.role}`,
    `## Background\n${challenge.background}`,
    `## Objective\n${challenge.objective}`,
    `## Task\n${challenge.task}`,
    `## Acceptance Criteria\n${challenge.acceptance_criteria}`,
  ].join("\n\n");

  const preview =
    fullContent.slice(0, PREVIEW_LENGTH) +
    (fullContent.length > PREVIEW_LENGTH ? "…" : "");

  const handleCopy = async () => {
    await navigator.clipboard.writeText(fullContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="border border-border hover:border-border-strong transition">
      <div className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="text-xs uppercase tracking-widest text-text-muted mb-2">
              Challenge {index + 1}
            </div>
            <h3 className="font-display text-lg uppercase tracking-tight mb-3">
              {challenge.objective.slice(0, OBJECTIVE_PREVIEW_LENGTH)}
              {challenge.objective.length > OBJECTIVE_PREVIEW_LENGTH ? "…" : ""}
            </h3>
          </div>
          <button
            onClick={handleCopy}
            className="shrink-0 p-2 text-text-muted hover:text-text transition"
            aria-label="Copy challenge to clipboard"
            title="Copy to clipboard"
          >
            {copied ? (
              <Check className="w-4 h-4 text-green-600" />
            ) : (
              <Copy className="w-4 h-4" />
            )}
          </button>
        </div>

        <div className="text-sm text-text-muted whitespace-pre-wrap">
          {expanded
            ? LinkifyGitHubRefs(fullContent, owner, repo)
            : LinkifyGitHubRefs(preview, owner, repo)}
        </div>

        <button
          onClick={() => setExpanded(!expanded)}
          className="mt-3 flex items-center gap-1 text-xs uppercase tracking-wider
                     text-text-muted hover:text-text transition"
        >
          {expanded ? (
            <>
              Show less <ChevronUp className="w-3.5 h-3.5" />
            </>
          ) : (
            <>
              See more <ChevronDown className="w-3.5 h-3.5" />
            </>
          )}
        </button>
      </div>
    </div>
  );
}

export default function ChallengesPage() {
  const params = useParams<{ owner: string; repo: string }>();
  const { owner, repo } = params;
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [fetchingNew, setFetchingNew] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  const fetchChallenges = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/challenges/${owner}/${repo}`);
      if (!res.ok) {
        const error = await res.text();
        throw new Error(error || "Failed to fetch challenges");
      }
      const data = await res.json();
      if (data.challenges.length > 0) {
        setChallenges([...data.challenges].sort(byRecency));
      } else {
        // No challenges exist — generate them
        setGenerating(true);
        const genRes = await fetch(`/api/challenges/${owner}/${repo}`, {
          method: "POST",
        });
        if (!genRes.ok) {
          const error = await genRes.text();
          throw new Error(error || "Failed to generate challenges");
        }
        const genData = await genRes.json();
        setChallenges([...genData.challenges].sort(byRecency));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
      setGenerating(false);
    }
  }, [owner, repo]);

  // Generate a fresh batch and prepend it to the list
  const fetchNew = useCallback(async () => {
    setFetchingNew(true);
    setError(null);
    try {
      const res = await fetch(`/api/challenges/${owner}/${repo}?refresh=true`, {
        method: "POST",
      });
      if (!res.ok) {
        const error = await res.text();
        throw new Error(error || "Failed to fetch new challenges");
      }
      const data = await res.json();
      setChallenges((prev) => [...data.challenges, ...prev]);
      setPage(1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setFetchingNew(false);
    }
  }, [owner, repo]);

  useEffect(() => {
    fetchChallenges();
  }, [fetchChallenges]);

  const totalPages = Math.max(1, Math.ceil(challenges.length / PAGE_SIZE));
  const pageStart = (page - 1) * PAGE_SIZE;
  const pageChallenges = challenges.slice(pageStart, pageStart + PAGE_SIZE);

  return (
    <div className="min-h-screen bg-bg">
      <div className="max-w-4xl mx-auto px-6 md:px-10 py-10">
        {/* Header */}
        <div className="mb-10">
          <Link
            href={`/wiki/${owner}/${repo}`}
            className="inline-flex items-center gap-1.5 text-xs uppercase tracking-widest
                       text-text-muted hover:text-text transition mb-4"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to Wiki
          </Link>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="font-display text-4xl md:text-5xl uppercase tracking-tight">
                Agent Challenges
              </h1>
              <p className="mt-2 text-sm text-text-muted">
                {owner}/{repo} — Tough eval-like tasks to test agent capabilities
              </p>
            </div>
            <button
              onClick={fetchNew}
              disabled={fetchingNew || loading}
              className="shrink-0 inline-flex items-center gap-2 border border-border
                         hover:border-border-strong px-4 py-2 text-xs uppercase tracking-wider
                         text-text-muted hover:text-text transition disabled:opacity-50
                         disabled:cursor-not-allowed"
              title="Generate a fresh batch of challenges"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${fetchingNew ? "animate-spin" : ""}`}
              />
              {fetchingNew ? "Fetching…" : "Fetch new"}
            </button>
          </div>
        </div>

        {/* Loading state */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-text-muted mb-4" />
            <p className="text-sm text-text-muted">
              {generating
                ? "Generating challenges — this may take a moment…"
                : "Loading challenges…"}
            </p>
          </div>
        )}

        {/* Error state */}
        {error && !loading && (
          <div className="border border-red-300 bg-red-50 p-5 text-sm text-red-800">
            {error}
          </div>
        )}

        {/* Challenges list */}
        {!loading && !error && challenges.length > 0 && (
          <>
            <div className="space-y-4">
              {pageChallenges.map((challenge, i) => (
                <ChallengeCard
                  key={challenge.id}
                  challenge={challenge}
                  index={pageStart + i}
                  owner={owner}
                  repo={repo}
                />
              ))}
            </div>

            {totalPages > 1 && (
              <div className="mt-8 flex items-center justify-between">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="inline-flex items-center gap-1 text-xs uppercase tracking-wider
                             text-text-muted hover:text-text transition
                             disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  Prev
                </button>
                <span className="text-xs uppercase tracking-widest text-text-muted">
                  Page {page} / {totalPages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="inline-flex items-center gap-1 text-xs uppercase tracking-wider
                             text-text-muted hover:text-text transition
                             disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Next
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
