import { Queue, QueueEvents } from "bullmq";
import { logger } from "@shared/logger.js";
import { jobOptions, type JobParams, QUEUES } from "./queue.utils.js";

const log = logger("queue:jobs");
const myQueue = new Queue(QUEUES.REINDEX);
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

const queueEvents = new QueueEvents(QUEUES.REINDEX);

queueEvents.on("waiting", ({ jobId }) => {
  console.log(`A job with ID ${jobId} is waiting`);
});

queueEvents.on("active", ({ jobId, prev }) => {
  console.log(`Job ${jobId} is now active; previous status was ${prev}`);
});

queueEvents.on("completed", ({ jobId, returnvalue }) => {
  console.log(`${jobId} has completed and returned ${returnvalue}`);
});

queueEvents.on("failed", ({ jobId, failedReason }) => {
  console.log(`${jobId} has failed with reason ${failedReason}`);
});
