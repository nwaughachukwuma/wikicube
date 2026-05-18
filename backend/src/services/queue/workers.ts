import { Worker } from "bullmq";
import { Redis } from "ioredis";
import { JOBS } from "./queue.utils.js";

const connection = new Redis({ maxRetriesPerRequest: null });

const worker = new Worker(
  JOBS.REINDEX,
  async (job) => {
    console.log(job.data);
  },
  { connection },
);

worker.on("completed", (job) => {
  console.log(`${job.id} has completed!`);
});

worker.on("failed", (job, err) => {
  if (job) {
    console.log(`${job.id} has failed with ${err.message}`);
    return;
  }
  console.log(`A Job has failed with ${err.message}`);
});
