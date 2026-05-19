/* ─── Wikicube Embeddings ─── */
import { makeRetriable } from "p-retry";
import { batchAll } from "./batch-ops";
import { logger } from "./logger";
import type { TaskType } from "./genai/utils";

const log = logger("wikicube:embeddings");

const EMBEDDINGS_BASE_URL = process.env.EMBEDDINGS_BASE_URL;

const TASK_TYPE_MAP: Record<
  TaskType,
  "search_document" | "search_query" | "classification" | "clustering"
> = {
  RETRIEVAL_DOCUMENT: "search_document",
  RETRIEVAL_QUERY: "search_query",
  QUESTION_ANSWERING: "search_query",
};

const BATCH_SIZE = 8;

async function embedContent(
  batch: string[],
  taskType: TaskType = "RETRIEVAL_DOCUMENT",
) {
  const response = await fetch(`${EMBEDDINGS_BASE_URL}/generate-embeddings`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": "wikicube/1.0",
    },
    body: JSON.stringify({
      texts: batch,
      task_type: TASK_TYPE_MAP[taskType],
      dimensionality: 768,
    }),
  });

  if (!response.ok) {
    throw new Error(`Embedding service returned ${response.status}`);
  }

  const data = (await response.json()) as { embeddings: number[][] };
  return data.embeddings;
}

const retryableEmbeddings = makeRetriable(embedContent, {
  retries: 3,
  onFailedAttempt: (ctx) => {
    log.warn(
      `Embedding batch ${ctx.attemptNumber} failed.` +
        ` ${ctx.retriesLeft} retries left. Error: ${ctx.error}`,
    );
  },
});

export async function generateEmbeddings(
  texts: string[],
  taskType: TaskType = "RETRIEVAL_DOCUMENT",
): Promise<number[][]> {
  if (texts.length === 0) return [];

  const batches: string[][] = [];
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    batches.push(texts.slice(i, i + BATCH_SIZE));
  }

  log.info("embedding started", {
    totalTexts: texts.length,
    batches: batches.length,
    batchSize: BATCH_SIZE,
  });

  const results = await batchAll(
    batches,
    (b) => retryableEmbeddings(b, taskType),
    5,
  );
  return results.flat();
}
