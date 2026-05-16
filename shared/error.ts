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

export class HttpError extends Error {
  public readonly status: number;
  public readonly statusText: string;
  public readonly code: string;
  public readonly originalError?: unknown;

  constructor(resp: Response, originalError?: unknown) {
    super(HttpError.getHumanReadableMessage(resp));
    this.name = "HttpError";
    this.status = resp.status;
    this.statusText = resp.statusText;
    this.code = HttpError.getErrorCode(resp);
    this.originalError = originalError;
  }

  static getErrorCode(resp: Response) {
    return (
      (
        {
          400: "BAD_REQUEST",
          401: "UNAUTHORIZED",
          403: "FORBIDDEN",
          404: "NOT_FOUND",
          409: "CONFLICT",
          422: "UNPROCESSABLE_ENTITY",
          429: "TOO_MANY_REQUESTS",
          500: "INTERNAL_SERVER_ERROR",
          502: "BAD_GATEWAY",
          503: "SERVICE_UNAVAILABLE",
          504: "GATEWAY_TIMEOUT",
        } as const
      )[resp.status] || "UNKNOWN_ERROR"
    );
  }

  static getHumanReadableMessage(resp: Response): string {
    const baseMessage = `${resp.status} ${resp.statusText}`;
    const customMessages: Record<number, string> = {
      400: `${baseMessage}: The request was malformed or missing required parameters.`,
      401: `${baseMessage}: Authentication is required. Please log in or provide valid credentials.`,
      403: `${baseMessage}: You don't have permission to access this resource.`,
      404: `${baseMessage}: The requested resource was not found.`,
      409: `${baseMessage}: The request conflicts with the current state of the resource.`,
      422: `${baseMessage}: The request was well-formed but contains semantic errors.`,
      429: `${baseMessage}: Too many requests. Please wait before trying again.`,
      500: `${baseMessage}: Something went wrong on our server. We're working to fix it.`,
      502: `${baseMessage}: The server received an invalid response from an upstream server.`,
      503: `${baseMessage}: The server is temporarily unavailable. Please try again later.`,
      504: `${baseMessage}: The upstream server timed out waiting for a response.`,
    };
    return customMessages[resp.status] || baseMessage;
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      status: this.status,
      statusText: this.statusText,
      code: this.code,
    };
  }
}
