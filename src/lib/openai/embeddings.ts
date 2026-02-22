/* ─── Embeddings ─── */
import { batchAll } from "../batchOps";
import { makeRetriable } from "p-retry";
import { logger } from "../logger";
import { getOpenAI } from "./utils";

const log = logger("openai:embeddings");

async function getEmbeddings(batch: string[]) {
  const res = await getOpenAI().embeddings.create({
    model: "text-embedding-3-small",
    input: batch,
    dimensions: 1536,
  });
  return res.data.map((d) => d.embedding);
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

  const results = await batchAll(
    batches,
    (b) => retryable(b).catch(() => []),
    5,
  );

  return results.flat();
}
