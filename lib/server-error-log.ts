import "server-only";

import fs from "node:fs";

const ERROR_LOG_PATH = "/tmp/sast-error-log.txt";

export interface ServerErrorLogContext {
  path?: string;
  method?: string;
  userId?: number | null;
  role?: number | null;
  action?: string;
  flowId?: number | null;
  userFlowId?: number | null;
  studentId?: string | null;
  targetUserId?: number | null;
  metadata?: Record<string, unknown>;
}

export interface ServerErrorLogEntry {
  index: number;
  raw: string;
  timestamp: string | null;
  source: string | null;
  message: string | null;
  context: ServerErrorLogContext | null;
}

function safeStringify(value: unknown) {
  try {
    return JSON.stringify(value);
  } catch {
    return JSON.stringify({ serializationError: "Unable to serialize context" });
  }
}

export function logServerError(
  source: string,
  err: unknown,
  context?: ServerErrorLogContext,
) {
  try {
    fs.appendFileSync(
      ERROR_LOG_PATH,
      `[${new Date().toISOString()}] ${source}\n` +
        (context ? `context: ${safeStringify(context)}\n` : "") +
        `name: ${err instanceof Error ? err.name : "Unknown"}\n` +
        `message: ${err instanceof Error ? err.message : String(err)}\n` +
        `stack: ${err instanceof Error ? err.stack : "none"}\n` +
        `---\n`,
    );
  } catch {}
}

export function readServerErrorLog(limit = 50) {
  if (!fs.existsSync(ERROR_LOG_PATH)) {
    return { count: 0, entries: [] as ServerErrorLogEntry[] };
  }

  const content = fs.readFileSync(ERROR_LOG_PATH, "utf-8");
  const blocks = content.trim().split("---\n").filter(Boolean);
  const entries = blocks.map((entry, index) => {
    const raw = entry.trim();
    const lines = raw.split("\n");
    const header = lines[0]?.match(/^\[(.+)]\s+(.+)$/);
    const messageLine = lines.find((line) => line.startsWith("message: "));
    const contextLine = lines.find((line) => line.startsWith("context: "));
    let context: ServerErrorLogContext | null = null;

    if (contextLine) {
      try {
        context = JSON.parse(contextLine.replace("context: ", "")) as ServerErrorLogContext;
      } catch {
        context = null;
      }
    }

    return {
      index: index + 1,
      raw,
      timestamp: header?.[1] ?? null,
      source: header?.[2] ?? null,
      message: messageLine?.replace("message: ", "") ?? null,
      context,
    };
  });

  return {
    count: entries.length,
    entries: entries.slice(-limit).reverse(),
  };
}
