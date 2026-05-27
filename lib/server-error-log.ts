import "server-only";

import fs from "node:fs";

const ERROR_LOG_PATH = "/tmp/sast-error-log.txt";

export interface ServerErrorLogEntry {
  index: number;
  raw: string;
  timestamp: string | null;
  source: string | null;
  message: string | null;
}

export function logServerError(source: string, err: unknown) {
  try {
    fs.appendFileSync(
      ERROR_LOG_PATH,
      `[${new Date().toISOString()}] ${source}\n` +
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

    return {
      index: index + 1,
      raw,
      timestamp: header?.[1] ?? null,
      source: header?.[2] ?? null,
      message: messageLine?.replace("message: ", "") ?? null,
    };
  });

  return {
    count: entries.length,
    entries: entries.slice(-limit).reverse(),
  };
}
