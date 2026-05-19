import { Queue, QueueEvents, Worker } from "bullmq";
import { logger } from "@shared/logger.js";
import type { Wiki } from "@shared/types.js";
import { getRedis, QUEUES } from "./queue.utils.js";
import { reindexWikiAndCode } from "../reindex.js";

const log = logger("queue:workers");

let hasBeenInit = false;
let myQueue: Queue | null = null;
export type ReindexJobName = "dummy" | "reindex";

// Queue
export function initReindexQueue() {
  if (hasBeenInit && myQueue) return myQueue;

  myQueue = new Queue(QUEUES.REINDEX, { connection: getRedis() });
  myQueue.setGlobalConcurrency(10);
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

    if (jobName === "reindex") {
      const wiki = job.data.wiki as Wiki | null;
      if (!wiki) {
        throw new Error("Wiki not found");
      }
      return await reindexWikiAndCode(wiki)
        .then((v) => {
          log.info("REINDEX JOB COMPLETED", { v });
        })
        .catch((err) => {
          log.info("REINDEX JOB FAILED", { err });
          throw err;
        });
    }
  },
  { connection: getRedis() },
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
