import "server-only";

import fs from "node:fs";

const ERROR_LOG_PATH = "/tmp/sast-error-log.txt";

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

