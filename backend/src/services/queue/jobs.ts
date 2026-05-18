import { Queue } from "bullmq";
import { JOBS } from "./queue.utils.js";

const myQueue = new Queue(JOBS.REINDEX);

async function addJobs() {
  await myQueue.add("myJobName", { foo: "bar" });
  await myQueue.add("myJobName", { qux: "baz" });
}

await addJobs();
