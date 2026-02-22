/** Lightweight structured logger for the analysis pipeline. */

type LogLevel = "debug" | "info" | "warn" | "error";

interface LogEntry {
  level: LogLevel;
  module: string;
  msg: string;
  [key: string]: unknown;
}

const isDev = process.env.NODE_ENV !== "production";

function formatDev(entry: LogEntry): string {
  const { level, module, msg, ...rest } = entry;
  const tag = `[${module}]`;
  const extras = Object.keys(rest).length > 0 ? ` ${JSON.stringify(rest)}` : "";

  return `${level.toUpperCase().padEnd(5)} ${tag} ${msg}${extras}`;
}

function emit(entry: LogEntry) {
  const out = isDev ? formatDev(entry) : JSON.stringify(entry);

  switch (entry.level) {
    case "error":
      console.error(out);
      break;
    case "warn":
      console.warn(out);
      break;
    case "debug":
      console.debug(out);
      break;
    default:
      console.log(out);
  }
}

export function logger(module: string) {
  function log(level: LogLevel, msg: string, data?: Record<string, unknown>) {
    emit({ level, module, msg, ts: new Date().toISOString(), ...data });
  }

  return {
    debug: (msg: string, data?: Record<string, unknown>) =>
      log("debug", msg, data),
    info: (msg: string, data?: Record<string, unknown>) =>
      log("info", msg, data),
    warn: (msg: string, data?: Record<string, unknown>) =>
      log("warn", msg, data),
    error: (msg: string, data?: Record<string, unknown>) =>
      log("error", msg, data),

    /**
     * Start a timer. Returns a function to call when the operation completes.
     * Logs at `info` level with duration in ms.
     *
     *   const done = log.time("fetchTree");
     *   await fetchTree();
     *   done({ fileCount: 42 });
     */
    time(operation: string) {
      const start = performance.now();
      return (data?: Record<string, unknown>) => {
        const durationMs = Math.round(performance.now() - start);
        log("info", `${operation} completed`, { durationMs, ...data });
      };
    },
  };
}
