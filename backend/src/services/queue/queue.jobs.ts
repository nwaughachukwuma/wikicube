import type { Queue } from "bullmq";
import { logger } from "@shared/logger.js";
import { initReindexQueue } from "./reindex.queue.js";
import { jobOptions, type JobName, type JobParams } from "./queue.utils.js";

const log = logger("queue:jobs");

export const makeJobs = (queue: Queue) => {
  try {
    queue.getMeta().then((v) => {
      log.info("Queue configuration.", { ...v });
    });
  } catch (error) {
    return null;
  }
  return {
    async addJob(name: JobName, data: Record<string, any>) {
      await queue.add(name, data, jobOptions);
    },
    async addBulkJobs(jobParams: JobParams[]) {
      return await queue.addBulk(
        jobParams.map((v) => ({ ...v, opts: jobOptions })),
      );
    },
  };
};

export const reindexJobs = makeJobs(initReindexQueue());
