import { expect, test } from "@playwright/test";
import { signInAs } from "./session";

const webhookSecret =
  process.env.EMAIL_WEBHOOK_SECRET ?? "playwright-webhook-secret";

test.describe("email center", () => {
  test("renders the dashboard for an admin session", async ({ page, context }) => {
    await signInAs(context, {
      uid: 900001,
      role: 4,
      name: "Playwright Admin",
      department: "software",
    });

    await page.goto("/dashboard/emails");

    await expect(
      page.getByText("统一管理系统邮件模板、发送任务和发送记录"),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: /发结果通知/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /发送记录/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /系统状态/ })).toBeVisible();
    /* 模板管理按「role >= 3 + 部门 scope」开放，管理员同样可见 */
    await expect(page.getByRole("link", { name: /模板管理/ })).toBeVisible();
  });

  test("department manager can open the template tab scoped to its department", async ({
    page,
    context,
  }) => {
    await signInAs(context, {
      uid: 900002,
      role: 3,
      name: "Playwright Dept Manager",
      department: "software",
    });

    await page.goto("/dashboard/emails?tab=templates");

    await expect(page.getByRole("heading", { name: "模板管理" })).toBeVisible({
      timeout: 15_000,
    });
    /* 模板归属：部长同样能在下拉里切换部门，默认落在本部门（只读浏览其他部门） */
    await expect(page.getByText("模板归属", { exact: true })).toBeVisible();
    await expect(page.getByLabel("模板归属")).toContainText("软件研发部");
    await expect(
      page.getByText(/本部门覆盖可编辑，其他部门只读浏览/),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "测试发送" }).first(),
    ).toBeVisible();
    /* 覆盖状态徽章：本部门覆盖 / 全局默认（只读）/ 全局默认 */
    await expect(
      page
        .getByText(/^(本部门覆盖|全局默认（只读）|全局默认|其他部门覆盖)$/)
        .first(),
    ).toBeVisible();
  });

  test("department manager can browse another department read-only", async ({
    page,
    context,
  }) => {
    await signInAs(context, {
      uid: 900003,
      role: 3,
      name: "Playwright Dept Reader",
      department: "software",
    });

    await page.goto("/dashboard/emails?tab=templates");
    await expect(page.getByRole("heading", { name: "模板管理" })).toBeVisible({
      timeout: 15_000,
    });

    await page.getByLabel("模板归属").click();
    await page.getByRole("option", { name: /多媒体部/ }).click();

    await expect(page).toHaveURL(/department=media/, { timeout: 15_000 });
    await expect(page.getByLabel("模板归属")).toContainText("多媒体部");
    /* 浏览的是别人的部门：卡片写明只读，且不给测试发送入口 */
    await expect(
      page.getByText(/只读浏览「多媒体部」的覆盖/).first(),
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("button", { name: "测试发送" })).toHaveCount(0);
  });

  test("administrator can switch the template scope to a department", async ({
    page,
    context,
  }) => {
    /* uid 1 是 e2e 环境的管理员（role 4，Link admin） */
    await signInAs(context, { uid: 1, role: 4, name: "管理员" });

    await page.goto("/dashboard/emails?tab=templates");
    await expect(page.getByRole("heading", { name: "模板管理" })).toBeVisible({
      timeout: 15_000,
    });

    await page.getByLabel("模板归属").click();
    await page.getByRole("option", { name: "手填新部门标识…" }).click();
    await page.getByLabel("手填部门标识").fill("software");
    await page.getByRole("button", { name: "使用" }).click();

    await expect(page).toHaveURL(/department=software/, { timeout: 15_000 });
    await expect(page.getByLabel("模板归属")).toContainText("软件研发部");
    /* 部门还没覆盖时卡片徽章标注内容来源；编辑弹窗写明写入目标与「保存会创建独立文案」 */
    await expect(
      page.getByText(/^(本部门覆盖|全局默认|全局默认（回落）)$/).first(),
    ).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: "编辑模板" }).first().click();
    await expect(
      page.getByText("（尚未覆盖，保存会创建该部门的独立文案）"),
    ).toBeVisible();
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
