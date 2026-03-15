"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { useEffect, useState, useCallback } from "react";
import {
  ChevronDown,
  ChevronUp,
  Copy,
  Check,
  ArrowLeft,
  Loader2,
} from "lucide-react";
import type { Challenge } from "@/lib/types";

const PREVIEW_LENGTH = 240;
const OBJECTIVE_PREVIEW_LENGTH = 100;

function ChallengeCard({
  challenge,
  index,
}: {
  challenge: Challenge;
  index: number;
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
          {expanded ? fullContent : preview}
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
  const [error, setError] = useState<string | null>(null);

  const fetchChallenges = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/challenges/${owner}/${repo}`);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to fetch challenges");
      }
      const data = await res.json();
      if (data.challenges.length > 0) {
        setChallenges(data.challenges);
      } else {
        // No challenges exist — generate them
        setGenerating(true);
        const genRes = await fetch(`/api/challenges/${owner}/${repo}`, {
          method: "POST",
        });
        if (!genRes.ok) {
          const errData = await genRes.json();
          throw new Error(errData.error || "Failed to generate challenges");
        }
        const genData = await genRes.json();
        setChallenges(genData.challenges);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
      setGenerating(false);
    }
  }, [owner, repo]);

  useEffect(() => {
    fetchChallenges();
  }, [fetchChallenges]);

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
          <h1 className="font-display text-4xl md:text-5xl uppercase tracking-tight">
            Agent Challenges
          </h1>
          <p className="mt-2 text-sm text-text-muted">
            {owner}/{repo} — Tough eval-like tasks to test agent capabilities
          </p>
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
          <div className="space-y-4">
            {challenges.map((challenge, i) => (
              <ChallengeCard
                key={challenge.id}
                challenge={challenge}
                index={i}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
