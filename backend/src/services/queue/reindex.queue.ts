import { Queue, QueueEvents, Worker } from "bullmq";
import { logger } from "@shared/logger.js";
import type { Wiki } from "@shared/types.js";
import { connection, getRedis, getWorkerRedis, QUEUES } from "./queue.utils.js";
import { reindexAllHandler } from "../../utils/reindex.js";

const log = logger("queue:workers");

let hasBeenInit = false;
let myQueue: Queue | null = null;
export type ReindexJobName = "dummy" | "reindex-all";

// Queue
export function initReindexQueue() {
  if (hasBeenInit && myQueue && connection) return myQueue;

  myQueue = new Queue(QUEUES.REINDEX, { connection: getRedis() });
  myQueue.on("error", (e) => log.warn("Queue error", { error: e.message }));
  myQueue
    .setGlobalConcurrency(10)
    .catch((e) =>
      log.warn("Failed to set global concurrency", { error: e.message }),
    );
  hasBeenInit = true;

  const queueEvents = new QueueEvents(QUEUES.REINDEX, {
    connection: getRedis(true),
  });
  queueEvents.on("waiting", ({ jobId }) => {
    log.info(`A job with ID ${jobId} is waiting`);
  });
  queueEvents.on("active", ({ jobId, prev }) => {
    log.info(`Job ${jobId} is now active; previous status was ${prev}`);
  });
  queueEvents.on("completed", ({ jobId, returnvalue }) => {
    log.info(`${jobId} has completed and returned ${returnvalue}`);
  });
  queueEvents.on("failed", ({ jobId, failedReason }) => {
    log.info(`${jobId} has failed with reason ${failedReason}`);
  });
  return myQueue;
}

// Worker
const reindexWorker = new Worker(
  QUEUES.REINDEX,
  async (job) => {
    const jobName = job.name as ReindexJobName;
    if (jobName === "dummy") {
      console.log({ data: job.data });
      return;
    }

    if (jobName === "reindex-all") {
      const wikis = job.data.wikis as Wiki[] | null;
      if (!wikis?.length) {
        throw new Error("No wikis found");
      }
      return await reindexAllHandler(wikis, job.data.githubToken)
        .then((v) => {
          log.info("REINDEX-ALL JOB COMPLETED", { v });
        })
        .catch((err) => {
          log.info("REINDEX-ALL JOB FAILED", { err });
          throw err;
        });
    }
  },
  { connection: getWorkerRedis() },
);

reindexWorker.on("completed", (job) => {
  log.info(`${job.id} has completed!`);
});

reindexWorker.on("failed", (job, err) => {
  if (job) {
    log.info(`${job.id} has failed with ${err.message}`);
    return;
  }
  log.info(`A Job has failed with ${err.message}`);
});
