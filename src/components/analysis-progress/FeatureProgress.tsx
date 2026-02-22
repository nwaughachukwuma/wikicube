"use client";

import { useState } from "react";
import { CheckIcon, Loader2Icon } from "lucide-react";
import type { TrackedFeature } from "./types";

function QueuedDot() {
  return (
    <div className="w-4 h-4 flex items-center justify-center">
      <div className="w-2 h-2 border border-border-strong rounded-full" />
    </div>
  );
}

interface FeatureProgressProps {
  features: TrackedFeature[];
  activeRef: React.RefObject<HTMLDivElement | null>;
}

export function FeatureProgress({ features, activeRef }: FeatureProgressProps) {
  const [showCompleted, setShowCompleted] = useState(false);

  const completedFeatures = features.filter((f) => f.status === "done");
  const activeFeatures = features.filter((f) => f.status !== "done");

  return (
    <div className="mt-6 pt-4 border-t border-border w-full flex flex-col">
      <p className="text-xs uppercase tracking-widest text-text-muted mb-3">
        Features ({completedFeatures.length}/{features.length})
      </p>

      {/* Collapsible completed section */}
      {completedFeatures.length > 0 && (
        <button
          onClick={() => setShowCompleted((prev) => !prev)}
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

      {/* Active + queued features */}
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
                  className="w-4 h-4 animate-spin shrink-0"
                  style={{ animation: "spin 0.3s linear infinite" }}
                />
              ) : (
                <QueuedDot />
              )}
              <span
                className={
                  isActive ? "text-text font-medium" : "text-text-muted"
                }
              >
                {f.title}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
