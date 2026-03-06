/* ─── Embeddings ─── */
import { batchAll } from "../batchOps";
import { makeRetriable } from "p-retry";
import { logger } from "../logger";
import {
  EMBEDDING_DIMENSIONS,
  EMBEDDING_MODEL,
  getGemini,
  type TaskType,
} from "./utils";

const log = logger("gemini:embeddings");

const retryable = makeRetriable(getGemini().models.embedContent, {
  retries: 3,
  onFailedAttempt: (ctx) => {
    log.warn(
      `Embedding features ${ctx.attemptNumber} failed.` +
        `There are ${ctx.retriesLeft} retries left. Error: ${ctx.error}`,
    );
  },
});

async function getEmbeddings(
  batch: string[],
  taskType: TaskType = "RETRIEVAL_DOCUMENT",
) {
  const res = await retryable({
    model: EMBEDDING_MODEL,
    contents: batch,
    config: {
      outputDimensionality: EMBEDDING_DIMENSIONS,
      taskType,
    },
  });

  if (!res.embeddings) {
    throw new Error("No embeddings returned from Gemini");
  }
  return res.embeddings.map((d) => d.values ?? []);
}

const BATCH_SIZE = 7;
/**
 * Embed texts in batches. The per-input limit is 8191 tokens
 */
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

  const results = await batchAll(batches, (b) => getEmbeddings(b, taskType), 5);
  return results.flat();
}
