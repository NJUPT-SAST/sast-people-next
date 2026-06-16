import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, spawnSync } from "node:child_process";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const port = process.env.PLAYWRIGHT_PORT ?? "3101";
const baseURL = `http://127.0.0.1:${port}`;
const env = {
  ...process.env,
  PLAYWRIGHT_PORT: port,
  PLAYWRIGHT_SKIP_WEB_SERVER: "1",
  SESSION_SECRET: process.env.SESSION_SECRET ?? "playwright-session-secret",
  EMAIL_WEBHOOK_SECRET:
    process.env.EMAIL_WEBHOOK_SECRET ?? "playwright-webhook-secret",
  LINK_USE_MOCK: process.env.LINK_USE_MOCK ?? "true",
  NEXT_TELEMETRY_DISABLED: "1",
};

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function canReachServer() {
  return new Promise((resolve) => {
    const request = http.get(baseURL, (response) => {
      response.resume();
      resolve(true);
    });
    request.on("error", () => resolve(false));
    request.setTimeout(1000, () => {
      request.destroy();
      resolve(false);
    });
  });
}

async function waitForServer(processRef) {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    if (processRef.exitCode !== null) {
      throw new Error(`Next dev server exited with code ${processRef.exitCode}`);
    }
    if (await canReachServer()) return;
    await wait(1000);
  }
  throw new Error(`Timed out waiting for ${baseURL}`);
}

function killProcessTree(processRef) {
  if (!processRef.pid || processRef.exitCode !== null) return;

  if (process.platform === "win32") {
    spawnSync("taskkill", ["/pid", String(processRef.pid), "/T", "/F"], {
      stdio: "ignore",
    });
    return;
  }

  processRef.kill("SIGTERM");
}

function runPlaywright() {
  return new Promise((resolve) => {
    const cliPath = path.join(rootDir, "node_modules", "@playwright", "test", "cli.js");
    const child = spawn(process.execPath, [cliPath, "test"], {
      cwd: rootDir,
      env,
      stdio: "inherit",
    });
    child.on("exit", (code) => resolve(code ?? 1));
  });
}

const nextPath = path.join(rootDir, "node_modules", "next", "dist", "bin", "next");
const server = spawn(
  process.execPath,
  [nextPath, "dev", "--hostname", "127.0.0.1", "--port", port],
  {
    cwd: rootDir,
    env,
    stdio: "inherit",
  },
);

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    killProcessTree(server);
    process.exit(130);
  });
}

let exitCode = 1;
try {
  await waitForServer(server);
  exitCode = await runPlaywright();
} finally {
  killProcessTree(server);
}

process.exit(exitCode);
