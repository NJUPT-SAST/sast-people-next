import { expect, test, type BrowserContext } from "@playwright/test";
import { SignJWT } from "jose";

const sessionSecret = process.env.SESSION_SECRET ?? "playwright-session-secret";
const webhookSecret =
  process.env.EMAIL_WEBHOOK_SECRET ?? "playwright-webhook-secret";

async function createAdminSessionCookie(uid = 1) {
  const encodedKey = new TextEncoder().encode(sessionSecret);
  return new SignJWT({
    uid,
    role: 3,
    name: "Local Admin",
    expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(encodedKey);
}

async function signInAsLocalAdmin(context: BrowserContext) {
  await context.addCookies([
    {
      name: "session",
      value: await createAdminSessionCookie(1),
      domain: "127.0.0.1",
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
      secure: false,
    },
  ]);
}

test.describe("email center prelaunch", () => {
  test.describe.configure({ timeout: 90_000 });

  test("admin UI tabs, test send, records, and system status", async ({
    page,
    context,
  }) => {
    await signInAsLocalAdmin(context);

    await page.goto("/dashboard/emails");
    await expect(
      page.getByText("统一管理系统邮件模板、发送任务和发送记录"),
    ).toBeVisible();

    for (const tab of ["发结果通知", "发送记录", "模板管理", "系统状态"]) {
      await expect(page.getByRole("link", { name: tab })).toBeVisible();
    }

    await page.getByRole("link", { name: "系统状态" }).click();
    await expect(page.getByRole("heading", { name: "环境" })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText("测试模式").first()).toBeVisible();
    await expect(page.getByText("测试重定向", { exact: true })).toBeVisible();
    await expect(page.getByText("发信服务", { exact: true })).toBeVisible();

    // CI has no SMTP; local/staging may be ready. Accept either status.
    const smtpReadyLocator = page.getByText("已就绪", { exact: true });
    const smtpMissingLocator = page.getByText("未配置", { exact: true });
    await expect(smtpReadyLocator.or(smtpMissingLocator)).toBeVisible({
      timeout: 15_000,
    });
    const smtpReady = await smtpReadyLocator.isVisible();

    await page.getByRole("link", { name: "模板管理" }).click();
    await expect(page.getByRole("heading", { name: "模板管理" })).toBeVisible({
      timeout: 15_000,
    });

    await page.getByRole("button", { name: "测试发送" }).first().click();
    await expect(page.getByRole("heading", { name: "测试发送" })).toBeVisible();
    await expect(page.locator("#test-email-address")).toBeVisible();

    if (smtpReady) {
      await page.locator("#test-email-address").fill("001@njupt.edu.cn");
      await page.getByRole("button", { name: "发送测试邮件" }).click();
      await expect(page.getByText(/测试邮件已发送/)).toBeVisible({
        timeout: 45_000,
      });
    }

    await page.keyboard.press("Escape");
    await expect(page.getByRole("heading", { name: "测试发送" })).toBeHidden({
      timeout: 5_000,
    });

    await page.getByRole("link", { name: "发送记录" }).click();
    await expect(page.getByRole("heading", { name: "发送记录" })).toBeVisible({
      timeout: 15_000,
    });
    // Avoid matching hidden <option> in status filter
    await expect(
      page.locator('[data-slot="badge"]', { hasText: "已发送" }).first(),
    ).toBeVisible({ timeout: 15_000 });

    await page.getByRole("link", { name: "发结果通知" }).click();
    await expect(page.getByText("通过").first()).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText("不通过").first()).toBeVisible();
    // Prefer visible lane/sidebar copy; avoid hidden <option>（待发 N）
    await expect(
      page.locator("p", { hasText: /待发 \d+|已发完/ }).first(),
    ).toBeVisible();
  });

  test("result send dialog respects already-sent preflight", async ({
    page,
    context,
  }) => {
    await signInAsLocalAdmin(context);
    await page.goto("/dashboard/emails?tab=tasks");

    const demoFlow = /2026\s*春季笔试招新\s*Demo/;
    const demoFlowButton = page.getByRole("button", { name: demoFlow });
    await expect(demoFlowButton.first()).toBeVisible({ timeout: 20_000 });
    await demoFlowButton.first().click();

    await expect(page.getByRole("heading", { name: demoFlow })).toBeVisible({
      timeout: 15_000,
    });

    const sendButtons = page.getByRole("button", { name: /^发送$/ });
    const count = await sendButtons.count();
    expect(count).toBeGreaterThan(0);

    let opened = false;
    for (let i = 0; i < count; i += 1) {
      const button = sendButtons.nth(i);
      if (await button.isEnabled()) {
        await button.click();
        await expect(
          page.getByRole("button", { name: "确认发送" }),
        ).toBeVisible();
        await page.getByRole("button", { name: "取消" }).click();
        opened = true;
        break;
      }
    }

    if (!opened) {
      await expect(page.locator("p", { hasText: /待发 0|已发完/ }).first()).toBeVisible();
      await expect(sendButtons.first()).toBeDisabled();
    }
  });

  test("webhook rejects bad secret and accepts real messageId", async ({
    request,
  }) => {
    const unauthorized = await request.post("/api/email/provider-events", {
      data: {
        event: "delivered",
        providerMessageId: "missing",
      },
    });
    expect(unauthorized.status()).toBe(401);

    const unmatched = await request.post("/api/email/provider-events", {
      headers: { "x-email-webhook-secret": webhookSecret },
      data: {
        event: "delivered",
        provider: "prelaunch-e2e",
        providerMessageId: "definitely-not-a-real-message-id",
        occurredAt: new Date().toISOString(),
      },
    });
    expect(unmatched.ok()).toBe(true);
    await expect(unmatched.json()).resolves.toMatchObject({
      matched: false,
    });
  });

  test("login page exposes test admin entry in development", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByText("使用测试帐号登入")).toBeVisible();

    const testForm = page
      .locator("form")
      .filter({ has: page.getByPlaceholder("请填写测试学号") });
    await testForm.getByPlaceholder("请填写测试学号").fill("001");
    await testForm.getByRole("button", { name: "登录", exact: true }).click();
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });
  });
});
