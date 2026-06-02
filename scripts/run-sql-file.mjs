import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";

for (const envFile of [".env.local", ".env"]) {
  const envPath = resolve(process.cwd(), envFile);
  if (!existsSync(envPath)) continue;

  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) continue;

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();
    process.env[key] ??= value.replace(/^['"]|['"]$/g, "");
  }
}

const sqlFile = process.argv[2];
const message = process.argv[3] ?? "SQL file executed.";

if (!sqlFile) {
  throw new Error("Usage: node scripts/run-sql-file.mjs <sql-file> [message]");
}

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required to run a SQL file.");
}

const sqlPath = resolve(process.cwd(), sqlFile);
const sql = readFileSync(sqlPath, "utf8");
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });

await client.connect();
try {
  await client.query(sql);
  console.log(message);
} finally {
  await client.end();
}
