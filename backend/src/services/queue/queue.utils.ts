import type { JobsOptions } from "bullmq";
import { Redis } from "ioredis";

export const QUEUES = Object.freeze({
  REINDEX: "reindex",
} as const);

export interface JobParams {
  name: string;
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
