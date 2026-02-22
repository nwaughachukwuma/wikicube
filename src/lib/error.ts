export function extractError<T>(
  err: NonNullable<T>,
  fallback?: string,
): string {
  return err instanceof Error || (typeof err === "object" && "message" in err)
    ? (err.message as string)
    : typeof err === "string"
      ? err
      : fallback || "Unknown error";
}
