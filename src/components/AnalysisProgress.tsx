"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import type { AnalysisEvent } from "@/lib/types";

interface Props {
  owner: string;
  repo: string;
}

interface ProgressStep {
  label: string;
  status: "pending" | "active" | "done" | "error";
}

export default function AnalysisProgress({ owner, repo }: Props) {
  const router = useRouter();
  const [steps, setSteps] = useState<ProgressStep[]>([
    { label: "Fetching repository tree", status: "active" },
    { label: "Identifying user-facing features", status: "pending" },
    { label: "Generating wiki pages", status: "pending" },
    { label: "Creating search index", status: "pending" },
  ]);
  const [features, setFeatures] = useState<
    Array<{ title: string; done: boolean }>
  >([]);
  const [error, setError] = useState("");

  const updateStep = useCallback(
    (index: number, status: ProgressStep["status"]) => {
      setSteps((prev) =>
        prev.map((s, i) => (i === index ? { ...s, status } : s)),
      );
    },
    [],
  );

  useEffect(() => {
    const abortController = new AbortController();

    async function runAnalysis() {
      try {
        const res = await fetch("/api/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            repoUrl: `https://github.com/${owner}/${repo}`,
          }),
          signal: abortController.signal,
        });

        if (!res.ok) {
          const data = await res.json();
          if (data.cached) {
            router.replace(`/wiki/${owner}/${repo}`);
            return;
          }
          throw new Error(data.error || "Analysis failed");
        }

        // Handle SSE or cached response
        const contentType = res.headers.get("content-type") || "";

        if (contentType.includes("application/json")) {
          const data = await res.json();
          if (data.status === "done") {
            router.replace(`/wiki/${owner}/${repo}`);
            return;
          }
        }

        // SSE stream
        const reader = res.body?.getReader();
        if (!reader) return;

        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            try {
              const event: AnalysisEvent = JSON.parse(line.slice(6));

              switch (event.type) {
                case "status":
                  if (event.status === "fetching_tree") {
                    updateStep(0, "active");
                  } else if (event.status === "identifying_features") {
                    updateStep(0, "done");
                    updateStep(1, "active");
                  } else if (event.status === "generating_pages") {
                    updateStep(1, "done");
                    updateStep(2, "active");
                  } else if (event.status === "embedding") {
                    updateStep(2, "done");
                    updateStep(3, "active");
                  }
                  break;

                case "feature_started":
                  setFeatures((prev) => [
                    ...prev,
                    { title: event.featureTitle, done: false },
                  ]);
                  break;

                case "feature_done":
                  setFeatures((prev) =>
                    prev.map((f) =>
                      f.title === event.featureTitle ||
                      f.title === event.featureTitle.replace(" (partial)", "")
                        ? { ...f, done: true }
                        : f,
                    ),
                  );
                  break;

                case "done":
                  updateStep(3, "done");
                  // Small delay for visual feedback
                  setTimeout(() => {
                    router.replace(`/wiki/${owner}/${repo}`);
                  }, 500);
                  break;

                case "error":
                  setError(event.message);
                  break;
              }
            } catch {
              // Skip malformed events
            }
          }
        }
      } catch (err) {
        if (!abortController.signal.aborted) {
          setError(err instanceof Error ? err.message : "Analysis failed");
        }
      }
    }

    runAnalysis();
    return () => abortController.abort();
  }, [owner, repo, router, updateStep]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6">
      <h1 className="font-display text-3xl md:text-4xl uppercase tracking-tight mb-2">
        Generating Wiki
      </h1>
      <p className="text-text-muted font-mono text-sm mb-10">
        {owner}/{repo}
      </p>

      {error ? (
        <div className="max-w-md w-full">
          <div className="p-4 border-2 border-red-400 bg-red-50 text-red-800 text-sm">
            <p className="font-medium">Analysis failed</p>
            <p className="mt-1">{error}</p>
          </div>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 px-4 py-2 border-2 border-border-strong text-sm font-display uppercase hover:bg-accent hover:border-accent transition"
          >
            Retry
          </button>
        </div>
      ) : (
        <div className="max-w-md w-full space-y-3">
          {steps.map((step, i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="w-5 h-5 flex items-center justify-center">
                {step.status === "done" ? (
                  <svg
                    className="w-5 h-5 text-green-600"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                ) : step.status === "active" ? (
                  <div className="w-3 h-3 bg-accent rounded-full animate-pulse" />
                ) : (
                  <div className="w-3 h-3 border border-border rounded-full" />
                )}
              </div>
              <span
                className={`text-sm ${
                  step.status === "done"
                    ? "text-text"
                    : step.status === "active"
                      ? "text-text font-medium"
                      : "text-text-muted"
                }`}
              >
                {step.label}
              </span>
            </div>
          ))}

          {/* Feature progress */}
          {features.length > 0 && (
            <div className="mt-6 pt-4 border-t border-border">
              <p className="text-xs uppercase tracking-widest text-text-muted mb-3">
                Features ({features.filter((f) => f.done).length}/
                {features.length})
              </p>
              <div className="space-y-1.5">
                {features.map((f, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    {f.done ? (
                      <svg
                        className="w-3.5 h-3.5 text-green-600"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                    ) : (
                      <div className="w-3.5 h-3.5 flex items-center justify-center">
                        <div className="w-2 h-2 bg-accent rounded-full animate-pulse" />
                      </div>
                    )}
                    <span className={f.done ? "text-text-muted" : "text-text"}>
                      {f.title}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
