"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import type { AnalysisEvent, WikiStatus } from "@/lib/types";
import type {
  ProgressStep,
  TrackedFeature,
  FeatureStatus,
} from "./analysis-progress/types";
import { ErrorPanel } from "./analysis-progress/ErrorPanel";
import { ProgressSteps } from "./analysis-progress/ProgressSteps";
import { FeatureProgress } from "./analysis-progress/FeatureProgress";

interface Props {
  owner: string;
  repo: string;
  onComplete?: () => void;
}

export default function AnalysisProgress({ owner, repo, onComplete }: Props) {
  const router = useRouter();
  const [steps, setSteps] = useState<ProgressStep[]>([
    { label: "Fetching repository tree", status: "active" },
    { label: "Identifying user-facing features", status: "pending" },
    { label: "Generating wiki pages", status: "pending" },
    { label: "Creating search index", status: "pending" },
  ]);
  const [features, setFeatures] = useState<TrackedFeature[]>([]);
  const [error, setError] = useState("");
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
                if (onComplete) {
                  onComplete();
                } else {
                  router.replace(`/wiki/${owner}/${repo}`);
                }
              }, 500);
              break;
            case "error":
              setError(event.message);
              break;
          }
        }
      }
    },
    [owner, repo, router, updateStep, handleStatusEvent, onComplete],
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
          throw new Error(data.error || "Analysis failed");
        }

        // Handle cached JSON response (already done)
        const contentType = res.headers.get("content-type") || "";
        if (contentType.includes("application/json")) {
          const data = await res.json();
          if (data.status === "done" || data.cached) {
            if (onComplete) {
              onComplete();
            } else {
              window.location.href = `/wiki/${owner}/${repo}`;
            }
            return;
          }
        }

        // SSE stream
        await handleStreamingResponse(res);
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
  }, [owner, repo, router, handleStreamingResponse, onComplete]);

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
          <ErrorPanel error={error} />
        ) : (
          <div className="w-full flex flex-col items-center">
            <ProgressSteps steps={steps} />
            {features.length > 0 && (
              <FeatureProgress features={features} activeRef={activeRef} />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
