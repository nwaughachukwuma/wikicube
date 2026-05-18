import { Queue, QueueEvents } from "bullmq";
import { logger } from "@shared/logger.js";
import { getRedis, jobOptions, type JobParams, QUEUES } from "./queue.utils.js";

const log = logger("queue:jobs");

const myQueue = new Queue(QUEUES.REINDEX, { connection: getRedis() });
myQueue.setGlobalConcurrency(10);

export const makeJobs = () => {
  myQueue.getMeta().then((v) => {
    log.info("Queue configuration.", { ...v });
  });

  return {
    async addJob(name: string, data: Record<string, any>) {
      await myQueue.add(name, data, jobOptions);
    },
    async addBulkJobs(jobParams: JobParams[]) {
      return await myQueue.addBulk(
        jobParams.map((v) => ({ ...v, opts: jobOptions })),
      );
    },
  };
};

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
