import type { JobsOptions } from "bullmq";
import { Redis } from "ioredis";
import type { Queue } from "bullmq";
import { logger } from "@shared/logger.js";

const log = logger("queue:utils");

export const QUEUES = Object.freeze({
  REINDEX: "reindex",
} as const);

export type JobName = "dummy" | "reindex";

export interface JobParams {
  name: JobName;
  data: Record<string, any>;
}

export const jobOptions: JobsOptions = {
  delay: 2000,
  removeOnComplete: 50,
  removeOnFail: { age: 36 * 3600, count: 1000 },
};

export const RedisOptions = {
  host: "localhost",
  port: 6379,
  maxRetriesPerRequest: null,
  password: process.env.REDIS_PASSWORD,
};

let connection: Redis | null = null;

export function getRedis(force = false) {
  if (force) return new Redis(RedisOptions);

  return (connection ||= new Redis(RedisOptions));
}

export const makeJobs = (queue: Queue) => {
  try {
    queue.getMeta().then((v) => {
      log.info("Queue configuration.", { ...v });
    });
  } catch (error) {
    return null;
  }
  return {
    async addJob(name: JobName, data: Record<string, any>) {
      await queue.add(name, data, jobOptions);
    },
    async addBulkJobs(jobParams: JobParams[]) {
      return await queue.addBulk(
        jobParams.map((v) => ({ ...v, opts: jobOptions })),
      );
    },
  };
};
