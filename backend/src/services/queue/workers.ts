import { Worker } from "bullmq";
import { Redis } from "ioredis";
import { QUEUES } from "./queue.utils.js";
import { logger } from "@shared/logger.js";

const log = logger("queue:workers");

const connection = new Redis({
  maxRetriesPerRequest: null,
  password: process.env.REDIS_PASSWORD,
});

const reindexWorker = new Worker(
  QUEUES.REINDEX,
  async (job) => {
    console.log(job.data);
  },
  { connection },
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
