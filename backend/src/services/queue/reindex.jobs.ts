import { Queue, QueueEvents } from "bullmq";
import { logger } from "@shared/logger.js";
import { getRedis, jobOptions, type JobParams, QUEUES } from "./queue.utils.js";

const log = logger("queue:jobs");
let hasBeenInit = false;
let myQueue: Queue | null = null;

function idempotentInit() {
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

export const makeJobs = () => {
  let queue: Queue | null = null;
  try {
    queue = idempotentInit();
    queue.getMeta().then((v) => {
      log.info("Queue configuration.", { ...v });
    });
  } catch (error) {
    return null;
  }

  return {
    async addJob(name: string, data: Record<string, any>) {
      await queue.add(name, data, jobOptions);
    },
    async addBulkJobs(jobParams: JobParams[]) {
      return await queue.addBulk(
        jobParams.map((v) => ({ ...v, opts: jobOptions })),
      );
    },
  };
};
