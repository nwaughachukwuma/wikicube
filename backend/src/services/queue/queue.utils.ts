import type { JobsOptions } from "bullmq";

export const QUEUES = Object.freeze({
  REINDEX: "reindex",
} as const);

export interface JobParams {
  name: string;
  data: Record<string, any>;
}

export const jobOptions: JobsOptions = {
  delay: 2000,
  removeOnComplete: 500,
  removeOnFail: { age: 36 * 3600, count: 5000 },
};
