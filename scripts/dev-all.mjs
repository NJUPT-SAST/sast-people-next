import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const isWindows = process.platform === "win32";
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pidFile = path.join(rootDir, "tmp", "dev-all.pid");
const servicePorts = [3001, 3002, 8288, 8289];
const children = new Set();
let databaseStarted = false;
let shuttingDown = false;

function start(command, args, options = {}) {
  const child = spawn(command, args, { stdio: "inherit", ...options });
  children.add(child);
  persistState();
  child.once("close", (code) => {
    children.delete(child);
    persistState();
    if (!shuttingDown && code !== 0) {
      void shutdown(code ?? 1);
    }
  });
  return child;
}

/* 只依赖 docker 与仓库内二进制：避免 PATH 上的 pnpm 解析问题影响开发环境启动 */
const composeFile = path.join(rootDir, "docker-compose.dev.yml");
const nextBin = path.join(rootDir, "node_modules", "next", "dist", "bin", "next");
const emailBin = path.join(rootDir, "node_modules", "react-email", "dist", "cli", "index.mjs");

function runDockerCompose(args) {
  return new Promise((resolve, reject) => {
    const child = spawn("docker", ["compose", "-f", composeFile, ...args], {
      stdio: "inherit",
      cwd: rootDir,
    });
    child.once("error", reject);
    child.once("close", (code) => code === 0
      ? resolve()
      : reject(new Error(`docker compose ${args.join(" ")} exited with code ${code ?? "unknown"}`)));
  });
}

function assertLocalBinaries() {
  for (const [label, binary] of [["next", nextBin], ["react-email", emailBin]]) {
    if (!existsSync(binary)) {
      throw new Error(`未找到 ${label} 可执行文件（${binary}），请先执行 pnpm install。`);
    }
  }
}

function stop(child) {
  if (!child.pid) return Promise.resolve();
  if (isWindows) {
    return new Promise((resolve) => {
      const killer = spawn("taskkill", ["/pid", String(child.pid), "/t", "/f"], { stdio: "ignore", windowsHide: true });
      killer.once("close", resolve);
      killer.once("error", resolve);
    });
  }
  child.kill("SIGTERM");
  return Promise.resolve();
}

/* ---------- 上次实例清理 ---------- */

/* 运行态文件记录本进程与已启动的子进程，供下次启动时收掉残留实例 */
function persistState() {
  mkdirSync(path.dirname(pidFile), { recursive: true });
  writeFileSync(
    pidFile,
    JSON.stringify({
      parent: process.pid,
      children: [...children].map((child) => child.pid).filter(Boolean),
      startedAt: new Date().toISOString(),
    }),
    "utf8",
  );
}

function readState() {
  if (!existsSync(pidFile)) return null;
  try {
    const parsed = JSON.parse(readFileSync(pidFile, "utf8"));
    return {
      parent: Number(parsed?.parent) || 0,
      children: Array.isArray(parsed?.children)
        ? parsed.children.map(Number).filter((pid) => Number.isInteger(pid) && pid > 0)
        : [],
    };
  } catch {
    return null;
  }
}

function removePidFile() {
  rmSync(pidFile, { force: true });
}

function isProcessAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function killProcessTree(pid) {
  if (isWindows) {
    spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
    return;
  }
  try {
    process.kill(pid, "SIGTERM");
  } catch {
    /* 进程已退出 */
  }
}

function commandLineOf(pid) {
  if (isWindows) {
    const result = spawnSync(
      "powershell",
      ["-NoProfile", "-Command", `(Get-CimInstance Win32_Process -Filter "ProcessId=${pid}").CommandLine`],
      { encoding: "utf8", windowsHide: true },
    );
    return result.status === 0 ? (result.stdout ?? "").trim() : "";
  }
  const result = spawnSync("ps", ["-o", "command=", "-p", String(pid)], { encoding: "utf8" });
  return result.status === 0 ? (result.stdout ?? "").trim() : "";
}

function listeningPidsFor(port) {
  if (isWindows) {
    const result = spawnSync("netstat", ["-ano"], { encoding: "utf8", windowsHide: true });
    const matches = (result.stdout ?? "").matchAll(
      new RegExp(`:${port}\\s+\\S+\\s+LISTENING\\s+(\\d+)`, "gi"),
    );
    return [...matches].map((match) => Number(match[1]));
  }
  const lsof = spawnSync("lsof", ["-ti", `tcp:${port}`, "-sTCP:LISTEN"], { encoding: "utf8" });
  const fromLsof = (lsof.stdout ?? "")
    .split("\n")
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isInteger(value) && value > 0);
  if (fromLsof.length > 0) return fromLsof;

  const ss = spawnSync("ss", ["-ltnp"], { encoding: "utf8" });
  const matches = (ss.stdout ?? "").matchAll(
    new RegExp(`:${port}\\s[\\s\\S]*?pid=(\\d+)`, "g"),
  );
  return [...matches].map((match) => Number(match[1]));
}

/* 只关闭本仓库的开发进程：dev-all 自身、它记录的子进程，或命令行指向本仓库的其他进程 */
function isRepoProcess(pid) {
  const command = commandLineOf(pid).toLowerCase();
  if (!command) return false;
  if (command.includes("dev-all.mjs") || command.includes(rootDir.toLowerCase())) {
    return true;
  }
  return /\b(node|cmd|pnpm|next|email|npm)\b/i.test(command);
}

async function waitForPortsReleased(ports, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const busy = [];
    for (const port of ports) if (await isPortInUse(port)) busy.push(port);
    if (busy.length === 0) return true;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return false;
}

/* 启动前先收掉上次留下的开发环境：先按运行态文件（父进程 + 已记录子进程），再按端口兜底 */
async function stopStaleInstance() {
  const stalePids = new Set();

  const previous = readState();
  if (previous) {
    for (const pid of [previous.parent, ...previous.children]) {
      if (
        pid > 0 &&
        pid !== process.pid &&
        isProcessAlive(pid) &&
        isRepoProcess(pid)
      ) {
        stalePids.add(pid);
      }
    }
  }

  for (const port of servicePorts) {
    if (!(await isPortInUse(port))) continue;
    for (const pid of listeningPidsFor(port)) {
      if (pid !== process.pid && isRepoProcess(pid)) stalePids.add(pid);
    }
  }

  removePidFile();
  if (stalePids.size === 0) return;

  console.log(
    `检测到上次的开发环境进程（PID ${[...stalePids].join(", ")}），正在关闭…`,
  );
  for (const pid of stalePids) killProcessTree(pid);
  await waitForPortsReleased([3001, 3002]);
}

function isPortInUse(port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: "127.0.0.1", port });
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => resolve(false));
  });
}

/* db:dev:up 会启动 inngest-dev 容器并占用 8288/8289：
   容器已在运行时这两个端口属于本项目，不能当作外来占用。 */
function isComposeInngestRunning() {
  const result = spawnSync(
    "docker",
    [
      "ps",
      "--filter",
      "name=sast-people-next-inngest-dev",
      "--format",
      "{{.Names}}",
    ],
    { encoding: "utf8" },
  );
  return result.status === 0 && (result.stdout ?? "").trim().length > 0;
}

async function assertPortsAvailable() {
  const occupied = [];
  for (const port of servicePorts) if (await isPortInUse(port)) occupied.push(port);
  if (occupied.length === 0) return;

  const inngestOwned = isComposeInngestRunning();
  const foreign = occupied.filter(
    (port) => !(inngestOwned && (port === 8288 || port === 8289)),
  );
  if (foreign.length > 0) {
    throw new Error(
      `开发环境端口已被占用：${foreign.join(", ")}。请先关闭上次启动的服务；` +
        `如果是上次 pnpm db:dev:up 留下的容器，可执行 pnpm db:dev:down。`,
    );
  }
}

async function shutdown(exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log("\nStopping development environment...");
  await Promise.all([...children].map(stop));
  if (databaseStarted) await runDockerCompose(["down"]).catch(() => undefined);
  removePidFile();
  process.exitCode = exitCode;
}

process.once("SIGINT", () => void shutdown());
process.once("SIGTERM", () => void shutdown());
if (isWindows) process.once("SIGBREAK", () => void shutdown());

try {
  await stopStaleInstance();
  await assertPortsAvailable();
  persistState();
  assertLocalBinaries();
  const docker = spawnSync("docker", ["info"], { stdio: "ignore" });
  if (docker.error || docker.status !== 0) {
    throw new Error("Docker Desktop 未运行。请启动 Docker Desktop 后重试。");
  }
  await runDockerCompose(["up", "-d"]);
  databaseStarted = true;

  console.log("Development environment started:");
  console.log("  Next.js:      http://localhost:3001");
  console.log("  Inngest:      http://localhost:8288");
  console.log("  Email preview: http://localhost:3002");
  console.log("Press Ctrl+C to stop all services and PostgreSQL.\n");

  start(process.execPath, [nextBin, "dev", "-p", "3001"], {
    cwd: rootDir,
    env: { ...process.env, INNGEST_DEV: "1" },
  });
  start(process.execPath, [emailBin, "dev", "--dir=emails", "--port=3002"], {
    cwd: rootDir,
  });
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  await shutdown(1);
}
