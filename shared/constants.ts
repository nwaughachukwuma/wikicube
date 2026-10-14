/**
 * Admin access is granted via the ADMIN_EMAILS env var — a comma-separated
 * list of email addresses, e.g. ADMIN_EMAILS="you@example.com,ops@example.com".
 * Matching is case-insensitive. When unset, no user has admin access.
 */
export function isAdminEmail(email: string): boolean {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean)
    .includes(email.toLowerCase());
}

/** A refresh that dies without releasing its lock stops blocking after this */
export const REFRESH_LOCK_TTL_MS = 3 * 60 * 60 * 1000;

/** Whether a live refresh holds the wiki's lock; an expired lock doesn't count */
export function isRefreshing(
  wiki: { refresh_started_at: string | null },
  now = Date.now(),
): boolean {
  return (
    !!wiki.refresh_started_at &&
    now - Date.parse(wiki.refresh_started_at) < REFRESH_LOCK_TTL_MS
  );
}
