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

async function getEmbeddings(
  batch: string[],
  taskType: TaskType = "RETRIEVAL_DOCUMENT",
) {
  const res = await getGemini().models.embedContent({
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
export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
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

  const retryable = makeRetriable(getEmbeddings, {
    retries: 3,
    onFailedAttempt: (ctx) => log.warn("Embedding batch failed", ctx),
  });
  const results = await batchAll(batches, (b) => retryable(b), 5);
  return results.flat();
}
