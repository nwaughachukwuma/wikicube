import { NextResponse } from "next/server";
import { getSupabaseUser } from "./supabase/server";
import type { Wiki } from "./types";
import pRetry from "p-retry";
import { ensureError, extractError } from "./error";
import { logger } from "./logger";

/**
 * Enforce access control for private wikis
 *
 * Check whether a user may access a given wiki.
 * Public wikis are accessible to everyone; private wikis require the user to
 * be the one who indexed them (indexed_by === userId).
 */
export function canAccessWiki(
  wiki: Wiki,
  userId: string | null | undefined,
): boolean {
  if (wiki.visibility !== "private") return true;
  return !!userId && wiki.indexed_by === userId;
}

export function privateWikiGuard(wiki: Wiki, userId?: string | null) {
  if (!canAccessWiki(wiki, userId)) {
    return NextResponse.json(
      { error: "You do not have access to this wiki" },
      { status: 403 },
    );
  }
}

export async function authRouteGuard(customError?: string) {
  const user = await getSupabaseUser();
  if (!user) {
    return {
      user: null,
      err: NextResponse.json(
        { error: customError || "Authentication required" },
        { status: 401 },
      ),
    };
  }
  return { user, err: null };
}

const DB_RETRY_OPTIONS = {
  retries: 3,
  minTimeout: 2_000,
  factor: 2,
  randomize: true,
} as const;

const log = logger("db:utils");

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
