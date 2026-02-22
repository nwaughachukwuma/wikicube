export interface ProgressStep {
  label: string;
  status: "pending" | "active" | "done" | "error";
}

export type FeatureStatus = "queued" | "in-progress" | "done";

export interface TrackedFeature {
  title: string;
  status: FeatureStatus;
}
