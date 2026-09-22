import { spawn, spawnSync } from "node:child_process";
import net from "node:net";

const isWindows = process.platform === "win32";
const pnpm = isWindows ? "pnpm.cmd" : "pnpm";
const children = new Set();
let databaseStarted = false;
let shuttingDown = false;

function start(command, args, options = {}) {
  const child = spawn(command, args, { stdio: "inherit", ...options });
  children.add(child);
  child.once("close", (code) => {
    children.delete(child);
    if (!shuttingDown && code !== 0) {
      void shutdown(code ?? 1);
    }
  });
  return child;
}

function startPnpm(args, options = {}) {
  if (!isWindows) return start(pnpm, args, options);
  return start(process.env.ComSpec ?? "cmd.exe", ["/d", "/s", "/c", `${pnpm} ${args.join(" ")}`], options);
}

function runPnpm(args) {
  return new Promise((resolve, reject) => {
    const child = isWindows
      ? spawn(process.env.ComSpec ?? "cmd.exe", ["/d", "/s", "/c", `${pnpm} ${args.join(" ")}`], { stdio: "inherit" })
      : spawn(pnpm, args, { stdio: "inherit" });
    child.once("error", reject);
    child.once("close", (code) => code === 0
      ? resolve()
      : reject(new Error(`pnpm ${args.join(" ")} exited with code ${code ?? "unknown"}`)));
  });
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

async function assertPortsAvailable() {
  const ports = [3001, 3002, 8288, 8289];
  const occupied = [];
  for (const port of ports) if (await isPortInUse(port)) occupied.push(port);
  if (occupied.length > 0) {
    throw new Error(`开发环境端口已被占用：${occupied.join(", ")}。请先关闭上次启动的服务。`);
  }
}

async function shutdown(exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log("\nStopping development environment...");
  await Promise.all([...children].map(stop));
  if (databaseStarted) await runPnpm(["db:dev:down"]);
  process.exitCode = exitCode;
}

process.once("SIGINT", () => void shutdown());
process.once("SIGTERM", () => void shutdown());
if (isWindows) process.once("SIGBREAK", () => void shutdown());

try {
  await assertPortsAvailable();
  const docker = spawnSync("docker", ["info"], { stdio: "ignore" });
  if (docker.error || docker.status !== 0) {
    throw new Error("Docker Desktop 未运行。请启动 Docker Desktop 后重试。");
  }
  await runPnpm(["db:dev:up"]);
  databaseStarted = true;

  console.log("Development environment started:");
  console.log("  Next.js:      http://localhost:3001");
  console.log("  Inngest:      http://localhost:8288");
  console.log("  Email preview: http://localhost:3002");
  console.log("Press Ctrl+C to stop all services and PostgreSQL.\n");

  startPnpm(["exec", "next", "dev", "-p", "3001"], { env: { ...process.env, INNGEST_DEV: "1" } });
  startPnpm(["exec", "email", "dev", "--dir=emails", "--port=3002"]);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  await shutdown(1);
}
