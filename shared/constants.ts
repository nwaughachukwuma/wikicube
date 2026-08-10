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
