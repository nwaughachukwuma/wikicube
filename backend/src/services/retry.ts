import { logger } from "@shared/logger";
import { ensureError, extractError } from "@shared/error";
import pRetry from "p-retry";

const log = logger("db:utils");

const DB_RETRY_OPTIONS = {
  retries: 3,
  minTimeout: 2_000,
  factor: 2,
  randomize: true,
} as const;

export async function withRetry<T>(
  operation: string,
  run: () => Promise<T>,
): Promise<T> {
  return pRetry(
    async () => {
      try {
        return await run();
      } catch (error) {
        throw ensureError(error, `${operation} failed`);
      }
    },
    {
      ...DB_RETRY_OPTIONS,
      onFailedAttempt(ctx) {
        log.warn(`${operation} failed`, {
          attemptNumber: ctx.attemptNumber,
          retriesLeft: ctx.retriesLeft,
          error: extractError(ctx.error),
        });
      },
    },
  );
}
