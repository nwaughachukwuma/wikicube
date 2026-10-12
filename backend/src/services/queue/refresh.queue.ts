import { Queue, Worker } from "bullmq";
import { logger } from "@shared/logger.js";
import {
  getRedis,
  getWorkerRedis,
  jobOptions,
  QUEUES,
  redisReady,
} from "./queue.utils.js";
import { runFreshnessSweep } from "../freshness.js";

const log = logger("queue:refresh");

const SWEEP_JOB = "freshness-sweep";
// Daily check (03:00 UTC); shouldRefresh keeps each wiki to at most one
// regeneration a week
const SWEEP_CRON = "0 3 * * *";

let queue: Queue | null = null;

/**
 * Start the refresh worker and register the daily freshness sweep. Safe to
 * call from every instance: the scheduler is keyed, so only one job fires
 * per tick. Without Redis there is no schedule.
 */
export async function startRefreshScheduler() {
  if (!(await redisReady())) {
    log.warn("Redis unreachable; scheduled wiki refresh disabled");
    return;
  }

  queue = new Queue(QUEUES.REFRESH, { connection: getRedis() });
  queue.on("error", (e) => log.warn("Queue error", { error: e.message }));
  await queue.upsertJobScheduler(
    SWEEP_JOB,
    { pattern: SWEEP_CRON },
    {
      name: SWEEP_JOB,
      opts: {
        removeOnComplete: jobOptions.removeOnComplete,
        removeOnFail: jobOptions.removeOnFail,
      },
    },
  );

  const worker = new Worker(
    QUEUES.REFRESH,
    async (job) => {
      if (job.name === SWEEP_JOB) return runFreshnessSweep();
    },
    { connection: getWorkerRedis() },
  );
  worker.on("failed", (job, err) =>
    log.warn("refresh job failed", { jobId: job?.id, error: err.message }),
  );
  log.info("wiki freshness sweep scheduled", { cron: SWEEP_CRON });
}

/**
 * Run a sweep now: queued when the scheduler is running, otherwise in the
 * background of this process.
 */
export async function triggerFreshnessSweep() {
  if (queue) {
    await queue.add(SWEEP_JOB, {}, jobOptions);
    return;
  }
  void runFreshnessSweep().catch((err: unknown) =>
    log.error("freshness sweep failed", {
      error: err instanceof Error ? err.message : String(err),
    }),
  );
}
