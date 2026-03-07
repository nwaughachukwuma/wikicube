export function ensureError(err: unknown, fallback = "Unknown error"): Error {
  if (err instanceof Error) return err;
  else if (typeof err === "string") return new Error(err);
  if (typeof err === "object" && err !== null) {
    if ("message" in err && typeof err.message === "string") {
      return new Error(err.message);
    }
    try {
      return new Error(JSON.stringify(err));
    } catch {}
  }
  return new Error(fallback);
}

export function extractError(err: unknown, fallback?: string): string {
  return ensureError(err, fallback).message;
}
