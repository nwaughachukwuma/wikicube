import { NextResponse } from "next/server";
import { getSupabaseSession, getSupabaseUser } from "@/lib/supabase/server";
import pRetry from "p-retry";
import { ensureError, extractError } from "./error";
import { logger } from "./logger";
import { repoGuard } from "@shared/github";

/**
 * Enforce access control for private wikis
 *
 * Check whether a user may access a given wiki.
 * Public wikis are accessible to everyone; private wikis require the user
 * to have active permission to the repo
 */
export async function canAccessRepo(
  owner: string,
  repo: string,
): Promise<boolean> {
  const session = await getSupabaseSession();
  const token = session?.provider_token || void 0;
  return await repoGuard(owner, repo, token)
    .then(() => true)
    .catch(() => false);
}

export async function validateRepoAccess(owner: string, repo: string) {
  if (!(await canAccessRepo(owner, repo))) {
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
