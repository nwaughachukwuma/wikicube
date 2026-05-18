import { Worker } from "bullmq";
import { getRedis, QUEUES } from "./queue.utils.js";
import { logger } from "@shared/logger.js";

const log = logger("queue:workers");

log.info("process.env.REDIS_PASSWORD", {
  pa: process.env.REDIS_PASSWORD,
  len: process.env.REDIS_PASSWORD.length,
});

const reindexWorker = new Worker(
  QUEUES.REINDEX,
  async (job) => {
    console.log(job.data);
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
