"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { purgeCached } from "@/lib/cache.client";
import { HttpError } from "@shared/error";
import type { Wiki } from "@shared/types";

interface Freshness {
  stale: boolean;
  refreshing: boolean;
  refreshError: string | null;
  sourceSha: string | null;
  latestSha: string;
}

const POLL_MS = 15_000;
const shortSha = (sha: string) => sha.slice(0, 7);

/**
 * Tells viewers of a private wiki that the repo has moved on, and lets them
 * regenerate it. Public wikis are kept fresh by the scheduled check instead.
 */
export default function WikiFreshnessBanner({
  owner,
  repo,
  wiki,
}: {
  owner: string;
  repo: string;
  wiki: Wiki;
}) {
  const [freshness, setFreshness] = useState<Freshness | null>(null);
  const [starting, setStarting] = useState(false);
  const isPrivate = wiki.visibility === "private";

  const load = useCallback(
    () =>
      fetch(`/api/wiki/${owner}/${repo}/freshness`, { cache: "no-store" })
        .then((res) => (res.ok ? (res.json() as Promise<Freshness>) : null))
        .catch(() => null),
    [owner, repo],
  );

  useEffect(() => {
    if (!isPrivate) return;
    let cancelled = false;
    load().then((next) => {
      if (!cancelled) setFreshness(next);
    });
    return () => {
      cancelled = true;
    };
  }, [isPrivate, load]);

  // While regenerating, poll until the new pages are live, then load them
  const refreshing = !!freshness?.refreshing;
  useEffect(() => {
    if (!refreshing) return;
    const interval = setInterval(async () => {
      const next = await load();
      if (!next || next.refreshing) return;

      clearInterval(interval);
      if (next.refreshError) {
        setFreshness(next);
        toast.error("Regeneration failed", { description: next.refreshError });
        return;
      }
      await purgeCached(`/api/wiki/${owner}/${repo}`);
      location.reload();
    }, POLL_MS);
    return () => clearInterval(interval);
  }, [refreshing, load, owner, repo]);

  const regenerate = async () => {
    setStarting(true);
    const res = await fetch(`/api/wiki/${owner}/${repo}/refresh`, {
      method: "POST",
    }).finally(() => setStarting(false));

    const body = await res.json().catch(() => ({}));
    if (body.status === "up_to_date") {
      toast.success("This wiki is already up to date");
      setFreshness((f) => f && { ...f, stale: false });
      return;
    }
    // 409: someone else already started it
    if (res.ok || res.status === 409) {
      setFreshness((f) => f && { ...f, refreshing: true, refreshError: null });
      return;
    }
    toast.error("Couldn't start regeneration", {
      description: body.error || HttpError.getHumanReadableMessage(res),
    });
  };

  if (!freshness || !(freshness.stale || freshness.refreshing)) return null;

  return (
    <div
      role="status"
      className="flex flex-wrap items-center gap-x-4 gap-y-2 pl-16 pr-6 md:px-10 py-3 border-b border-border bg-bg-alt text-sm"
    >
      {freshness.refreshing ? (
        <p className="flex items-center gap-2 text-text-muted">
          <RefreshCw className="w-3.5 h-3.5 animate-spin shrink-0" />
          Regenerating from the latest commit. This page updates when the new
          version is ready, usually within a few minutes.
        </p>
      ) : (
        <>
          <p className="text-text-muted">
            The repo has changed since this wiki was generated
            {freshness.sourceSha && (
              <>
                {" "}
                (<code>{shortSha(freshness.sourceSha)}</code> →{" "}
                <code>{shortSha(freshness.latestSha)}</code>)
              </>
            )}
            .{freshness.refreshError && " The last regeneration failed."}
          </p>
          <button
            onClick={regenerate}
            disabled={starting}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-border text-xs font-display
                       uppercase tracking-wide hover:border-border-strong transition
                       disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${starting ? "animate-spin" : ""}`}
            />
            Regenerate
          </button>
        </>
      )}
    </div>
  );
}
