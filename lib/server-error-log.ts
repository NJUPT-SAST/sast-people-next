import "server-only";

import * as Sentry from "@sentry/nextjs";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const ERROR_LOG_PATH = path.join(os.tmpdir(), "sast-error-log.txt");

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
  name: string | null;
  message: string | null;
  digest: string | null;
  context: ServerErrorLogContext | null;
}

function safeStringify(value: unknown) {
  try {
    return JSON.stringify(value);
  } catch {
    return JSON.stringify({ serializationError: "Unable to serialize context" });
  }
}

export function isNextControlFlowError(err: unknown) {
  if (!(err instanceof Error)) return false;
  const digest = (err as Error & { digest?: string }).digest;
  return err.message === "NEXT_REDIRECT" || digest === "DYNAMIC_SERVER_USAGE";
}

export function logServerError(
  source: string,
  err: unknown,
  context?: ServerErrorLogContext,
) {
  if (isNextControlFlowError(err)) return;
  const digest = err instanceof Error
    ? (err as Error & { digest?: string }).digest
    : undefined;

  Sentry.withScope((scope) => {
    scope.setTag("source", source);
    if (digest) scope.setTag("digest", digest);
    if (context) {
      scope.setContext("serverErrorLog", { ...context });
      if (context.path) scope.setTag("path", context.path);
      if (context.action) scope.setTag("action", context.action);
      if (context.role !== undefined && context.role !== null) {
        scope.setTag("role", String(context.role));
      }
      if (context.userId !== undefined && context.userId !== null) {
        scope.setUser({ id: String(context.userId) });
      }
    }
    Sentry.captureException(err instanceof Error ? err : new Error(String(err)));
  });

  try {
    fs.mkdirSync(path.dirname(ERROR_LOG_PATH), { recursive: true });
    fs.appendFileSync(
      ERROR_LOG_PATH,
      `[${new Date().toISOString()}] ${source}\n` +
        (context ? `context: ${safeStringify(context)}\n` : "") +
        `name: ${err instanceof Error ? err.name : "Unknown"}\n` +
        `message: ${err instanceof Error ? err.message : String(err)}\n` +
        (digest ? `digest: ${digest}\n` : "") +
        `stack: ${err instanceof Error ? err.stack : "none"}\n` +
        `---\n`,
    );
  } catch (writeError) {
    console.error("[server-error-log] failed to write local log", writeError);
  }
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
    const nameLine = lines.find((line) => line.startsWith("name: "));
    const messageLine = lines.find((line) => line.startsWith("message: "));
    const digestLine = lines.find((line) => line.startsWith("digest: "));
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
      name: nameLine?.replace("name: ", "") ?? null,
      message: messageLine?.replace("message: ", "") ?? null,
      digest: digestLine?.replace("digest: ", "") ?? null,
      context,
    };
  });

  return {
    count: entries.length,
    entries: entries.slice(-limit).reverse(),
  };
}
