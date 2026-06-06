import type { JobsOptions } from "bullmq";
import { Redis } from "ioredis";
import type { Queue } from "bullmq";
import { logger } from "@shared/logger.js";

const log = logger("queue:utils");

export const QUEUES = Object.freeze({
  REINDEX: "reindex",
} as const);

export interface JobParams<T extends string> {
  name: T;
  data: Record<string, any>;
}

export const jobOptions: JobsOptions = {
  delay: 1000,
  removeOnComplete: 50,
  removeOnFail: { age: 36 * 3600, count: 1000 },
};

export const REDIS_MAX_RETRIES = 5;

const backoff = (times: number) => Math.min(times * 200, 2000);

export const WorkerRedisOptions = {
  host: "localhost",
  port: 6379,
  maxRetriesPerRequest: null,
  password: process.env.REDIS_PASSWORD,
  retryStrategy: backoff,
};

export const RedisOptions = {
  ...WorkerRedisOptions,
  retryStrategy: (times: number) =>
    times > REDIS_MAX_RETRIES ? null : backoff(times),
};

export let connection: Redis | null = null;

function createRedis(options = RedisOptions) {
  const redis = new Redis(options);
  redis.on("error", (e) =>
    log.warn("Redis connection error", { error: e.message }),
  );
  return redis;
}

export function getRedis(force = false) {
  if (
    force ||
    !connection ||
    connection.status === "close" ||
    connection.status === "end"
  ) {
    connection = createRedis();
    connection.on("error", () => (connection = null));
    connection.on("close", () => (connection = null));
  }
  return connection;
}

/** Dedicated uncapped connection for the long-running worker. */
export const getWorkerRedis = () => createRedis(WorkerRedisOptions);

/** Resolve once the connection is usable, or false once it has given up. */
async function redisReady(): Promise<boolean> {
  const redis = getRedis();
  if (redis.status === "ready") return Promise.resolve(true);
  if (redis.status === "end") return Promise.resolve(false);

  return new Promise((resolve) => {
    const done = (ok: boolean) => {
      redis.off("ready", onReady);
      redis.off("end", onEnd);
      resolve(ok);
    };
    const onReady = () => done(true);
    const onEnd = () => done(false);
    redis.once("ready", onReady);
    redis.once("end", onEnd);
  });
}

export const makeJobs = async <T extends string>(queue: Queue) => {
  if (!(await redisReady())) {
    log.warn(
      "Redis unreachable; queue disabled, falling back to immediate execution",
    );
    return null;
  }
  return {
    async add(name: T, data: Record<string, any>) {
      await queue.add(name, data, jobOptions);
    },
    async addBulk(jobParams: JobParams<T>[]) {
      return await queue.addBulk(
        jobParams.map((v) => ({ ...v, opts: jobOptions })),
      );
    },
  };
};
