import { CheckIcon } from "lucide-react";
import type { ProgressStep } from "./types";

export function ProgressSteps({ steps }: { steps: ProgressStep[] }) {
  return (
    <div className="space-y-3">
      {steps.map((step, i) => (
        <div key={i} className="flex items-center gap-3">
          <div className="w-5 h-5 flex items-center justify-center">
            {step.status === "done" ? (
              <CheckIcon className="text-green-600 w-4 h-4" />
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
    </div>
  );
}
