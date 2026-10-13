import type { BrowserContext } from "@playwright/test";
import type { Wiki } from "@shared/types";

export const PUBLIC_WIKI_OWNER = "marcelroed";
export const PUBLIC_WIKI_REPO = "gigatoken";
export const PUBLIC_WIKI_OVERVIEW =
  "# Gigatoken\n\nA **fast** tokenizer for large datasets.";

export const PRIVATE_WIKI_OWNER = "nwaughachukwuma";
export const PRIVATE_WIKI_REPO = "private-wikicube-e2e";
export const PRIVATE_WIKI_OVERVIEW =
  "This private overview must never appear in page metadata.";

export function makeWiki(
  owner: string,
  repo: string,
  overview: string,
  visibility: "public" | "private",
): Wiki {
  return {
    id: `wiki-${owner}-${repo}`,
    owner,
    repo,
    default_branch: "main",
    overview,
    status: "done",
    visibility,
    indexed_by: visibility === "private" ? "user-1" : null,
    search_ready: true,
    search_error: null,
    generation: 0,
    source_commit_sha: null,
    latest_commit_sha: null,
    generated_at: "2024-01-01T00:00:00Z",
    checked_at: null,
    refresh_started_at: null,
    refresh_error: null,
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
  };
}

export const publicWiki = makeWiki(
  PUBLIC_WIKI_OWNER,
  PUBLIC_WIKI_REPO,
  PUBLIC_WIKI_OVERVIEW,
  "public",
);

export const privateWiki = makeWiki(
  PRIVATE_WIKI_OWNER,
  PRIVATE_WIKI_REPO,
  PRIVATE_WIKI_OVERVIEW,
  "private",
);

export const USER = {
  id: "user-1",
  aud: "authenticated",
  role: "authenticated",
  email: "e2e@example.com",
  app_metadata: { provider: "github", providers: ["github"] },
  user_metadata: { user_name: "e2e-user" },
  created_at: "2024-01-01T00:00:00Z",
};

const b64url = (v: unknown) =>
  Buffer.from(JSON.stringify(v)).toString("base64url");

/** Seed the @supabase/ssr browser cookie with a non-expiring fake session. */
export async function signIn(context: BrowserContext) {
  const exp = Math.floor(Date.now() / 1000) + 365 * 24 * 3600;
  const jwt = `${b64url({ alg: "HS256", typ: "JWT" })}.${b64url({
    sub: USER.id,
    aud: USER.aud,
    role: USER.role,
    email: USER.email,
    exp,
  })}.sig`;
  const session = {
    access_token: jwt,
    refresh_token: "refresh-token",
    token_type: "bearer",
    expires_in: 365 * 24 * 3600,
    expires_at: exp,
    provider_token: "gh-token",
    user: USER,
  };
  // NEXT_PUBLIC_SUPABASE_URL is http://localhost:<mock port>, so the storage
  // key derived by supabase-js is `sb-localhost-auth-token`.
  await context.addCookies([
    {
      name: "sb-localhost-auth-token",
      value: `base64-${b64url(session)}`,
      url: "http://localhost:3000",
    },
  ]);
}
