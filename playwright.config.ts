import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.PLAYWRIGHT_PORT ?? 3101);
const baseURL = `http://127.0.0.1:${port}`;
const skipWebServer = process.env.PLAYWRIGHT_SKIP_WEB_SERVER === "1";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: false,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  ...(skipWebServer
    ? {}
    : {
        webServer: {
          command: `node node_modules/next/dist/bin/next dev --hostname 127.0.0.1 --port ${port}`,
          url: baseURL,
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
          gracefulShutdown: { signal: "SIGINT" as const, timeout: 5_000 },
          env: {
            SESSION_SECRET:
              process.env.SESSION_SECRET ?? "playwright-session-secret",
            EMAIL_WEBHOOK_SECRET:
              process.env.EMAIL_WEBHOOK_SECRET ?? "playwright-webhook-secret",
            LINK_USE_MOCK: process.env.LINK_USE_MOCK ?? "true",
            NEXT_TELEMETRY_DISABLED: "1",
          },
        },
      }),
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
