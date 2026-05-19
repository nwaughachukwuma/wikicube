import { makeJobs } from "./queue.utils.js";
import { initReindexQueue, type ReindexJobName } from "./reindex.queue.js";

export const queueJobs = {
  reindex: makeJobs<ReindexJobName>(initReindexQueue()),
};
