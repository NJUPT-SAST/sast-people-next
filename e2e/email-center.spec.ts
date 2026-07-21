import { expect, test, type BrowserContext } from "@playwright/test";
import { SignJWT } from "jose";

const sessionSecret = process.env.SESSION_SECRET ?? "playwright-session-secret";
const webhookSecret =
  process.env.EMAIL_WEBHOOK_SECRET ?? "playwright-webhook-secret";

async function createAdminSessionCookie() {
  const encodedKey = new TextEncoder().encode(sessionSecret);
  return new SignJWT({
    uid: 900001,
    role: 3,
    name: "Playwright Admin",
    expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(encodedKey);
}

async function signInAsAdmin(context: BrowserContext) {
  await context.addCookies([
    {
      name: "session",
      value: await createAdminSessionCookie(),
      domain: "127.0.0.1",
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
      secure: false,
    },
  ]);
}

test.describe("email center", () => {
  test("renders the dashboard for an admin session", async ({ page, context }) => {
    await signInAsAdmin(context);

    await page.goto("/dashboard/emails");

    await expect(
      page.getByText("统一管理系统邮件模板、发送任务和发送记录"),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: /发结果通知/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /发送记录/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /系统状态/ })).toBeVisible();
  });

  test("protects and accepts provider webhook events", async ({ request }) => {
    const unauthorized = await request.post("/api/email/provider-events", {
      data: {
        event: "delivered",
        providerMessageId: "missing-message",
      },
    });
    expect(unauthorized.status()).toBe(401);

    const accepted = await request.post("/api/email/provider-events", {
      headers: {
        "x-email-webhook-secret": webhookSecret,
      },
      data: {
        event: "delivered",
        provider: "playwright",
        providerMessageId: "missing-message",
        occurredAt: "2026-06-10T10:00:00.000Z",
      },
    });

    expect(accepted.ok()).toBe(true);
    await expect(accepted.json()).resolves.toEqual({
      matched: false,
      deliveryId: null,
      status: null,
    });
  });
});
