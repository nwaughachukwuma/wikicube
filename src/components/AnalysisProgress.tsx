"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import type { AnalysisEvent, WikiStatus } from "@/lib/types";
import { CheckIcon, Loader2Icon } from "lucide-react";

interface Props {
  owner: string;
  repo: string;
}

interface ProgressStep {
  label: string;
  status: "pending" | "active" | "done" | "error";
}

type FeatureStatus = "queued" | "in-progress" | "done";

interface TrackedFeature {
  title: string;
  status: FeatureStatus;
}

function QueuedDot() {
  return (
    <div className="w-4 h-4 flex items-center justify-center">
      <div className="w-2 h-2 border border-border-strong rounded-full" />
    </div>
  );
}

export default function AnalysisProgress({ owner, repo }: Props) {
  const router = useRouter();
  const [steps, setSteps] = useState<ProgressStep[]>([
    { label: "Fetching repository tree", status: "active" },
    { label: "Identifying user-facing features", status: "pending" },
    { label: "Generating wiki pages", status: "pending" },
    { label: "Creating search index", status: "pending" },
  ]);
  const [features, setFeatures] = useState<TrackedFeature[]>([]);
  const [error, setError] = useState("");
  const [showCompleted, setShowCompleted] = useState(false);
  const [running, setRunning] = useState(false);
  const activeRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to the first in-progress item
  useEffect(() => {
    activeRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [features]);

  // Warn user before leaving while analysis is running
  useEffect(() => {
    if (!running) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [running]);

  const updateStep = useCallback(
    (index: number, status: ProgressStep["status"]) => {
      setSteps((prev) =>
        prev.map((s, i) => (i === index ? { ...s, status } : s)),
      );
    },
    [],
  );

  const handleStatusEvent = useCallback(
    (status: WikiStatus) => {
      if (status === "fetching_tree") {
        updateStep(0, "active");
      } else if (status === "identifying_features") {
        updateStep(0, "done");
        updateStep(1, "active");
      } else if (status === "generating_pages") {
        updateStep(1, "done");
        updateStep(2, "active");
      } else if (status === "embedding") {
        updateStep(2, "done");
        updateStep(3, "active");
      }
    },
    [updateStep],
  );

  // SSE stream
  const handleStreamingResponse = useCallback(
    async (res: Response) => {
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
          let event: AnalysisEvent | undefined;
          try {
            event = JSON.parse(line.slice(6));
          } catch {
            // Skip malformed events
          }

          if (!event) continue;

          switch (event.type) {
            case "status":
              handleStatusEvent(event.status);
              break;
            case "features_list":
              setFeatures(
                event.features.map((title) => ({
                  title,
                  status: "queued" as FeatureStatus,
                })),
              );
              break;
            case "feature_started":
              setFeatures((prev) =>
                prev.map((f) =>
                  f.title === event.featureTitle
                    ? { ...f, status: "in-progress" as FeatureStatus }
                    : f,
                ),
              );
              break;
            case "feature_done":
              setFeatures((prev) =>
                prev.map((f) =>
                  f.title === event.featureTitle ||
                  f.title === event.featureTitle.replace(" (partial)", "")
                    ? { ...f, status: "done" as FeatureStatus }
                    : f,
                ),
              );
              break;
            case "done":
              updateStep(3, "done");
              setTimeout(() => {
                router.replace(`/wiki/${owner}/${repo}`);
              }, 500);
              break;
            case "error":
              setError(event.message);
              break;
          }
        }
      }
    },
    [owner, repo, router, updateStep, handleStatusEvent],
  );

  useEffect(() => {
    const abortController = new AbortController();

    async function runAnalysis() {
      setRunning(true);
      try {
        const res = await fetch("/api/analyze", {
          method: "POST",
          body: JSON.stringify({
            repoUrl: `https://github.com/${owner}/${repo}`,
          }),
          headers: { "Content-Type": "application/json" },
          signal: abortController.signal,
        });

        if (!res.ok) {
          const data = await res.json();
          if (data.cached) {
            return router.replace(`/wiki/${owner}/${repo}`);
          }
          throw new Error(data.error || "Analysis failed");
        }

        // Handle cached JSON response (already done)
        const contentType = res.headers.get("content-type") || "";
        if (contentType.includes("application/json")) {
          const data = await res.json();
          if (data.status === "done") {
            return router.replace(`/wiki/${owner}/${repo}`);
          }
        }

        // SSE stream
        await handleStreamingResponse(res);
        // navigate to wiki on completion
        return router.replace(`/wiki/${owner}/${repo}`);
      } catch (err) {
        if (!abortController.signal.aborted) {
          setError(err instanceof Error ? err.message : "Analysis failed");
        }
      } finally {
        setRunning(false);
      }
    }

    runAnalysis();
    return () => abortController.abort();
  }, [owner, repo, router, handleStreamingResponse]);

  const completedFeatures = features.filter((f) => f.status === "done");
  const activeFeatures = features.filter((f) => f.status !== "done");

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-md flex flex-col items-center">
        <h1 className="font-display text-3xl md:text-4xl uppercase tracking-tight mb-2 text-center">
          Generating Wiki
        </h1>
        <p className="text-text-muted font-mono text-sm mb-10 text-center">
          {owner}/{repo}
        </p>

        {error ? (
          <div className="w-full">
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
          <div className="w-full flex flex-col items-center">
            {/* Phase progress steps */}
            <div className="space-y-3">
              {steps.map((step, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="w-5 h-5 flex items-center justify-center">
                    {step.status === "done" ? (
                      <CheckIcon size={5} />
                    ) : step.status === "active" ? (
                      // <Loader2Icon size={5} />
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
            </div>

            {/* Feature progress */}
            {features.length > 0 && (
              <div className="mt-6 pt-4 border-t border-border w-full flex flex-col">
                <p className="text-xs uppercase tracking-widest text-text-muted mb-3">
                  Features ({completedFeatures.length}/{features.length})
                </p>

                {/* Collapsed completed section */}
                {completedFeatures.length > 0 && (
                  <button
                    onClick={() => setShowCompleted(!showCompleted)}
                    className="mb-2 text-xs text-text-muted hover:text-text transition flex items-center gap-1"
                  >
                    <svg
                      className={`w-3 h-3 transition-transform ${showCompleted ? "rotate-90" : ""}`}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 5l7 7-7 7"
                      />
                    </svg>
                    {completedFeatures.length} completed
                  </button>
                )}

                {showCompleted && completedFeatures.length > 0 && (
                  <div className="mb-3 space-y-1.5 w-full flex-col max-h-40 overflow-y-auto">
                    {completedFeatures.map((f, i) => (
                      <div key={i} className="flex items-center gap-2 text-sm">
                        <CheckIcon />
                        <span className="text-text-muted">{f.title}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Active + queued features in a scrolling container */}
                <div className="max-h-52 flex flex-col py-2 items-start overflow-y-auto space-y-1.5 w-full">
                  {activeFeatures.map((f, i) => {
                    const isActive = f.status === "in-progress";
                    return (
                      <div
                        key={i}
                        ref={isActive ? activeRef : undefined}
                        className="flex items-center gap-2 text-sm justify-center"
                      >
                        {isActive ? (
                          <Loader2Icon
                            className="animate-spin"
                            style={{ animation: "spin 0.3s linear infinite" }}
                          />
                        ) : (
                          <QueuedDot />
                        )}
                        <span
                          className={
                            isActive
                              ? "text-text font-medium"
                              : "text-text-muted"
                          }
                        >
                          {f.title}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
