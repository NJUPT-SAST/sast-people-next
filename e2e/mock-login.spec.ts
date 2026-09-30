import { expect, test } from "@playwright/test";

/**
 * 本地 mock 登录：身份 + 部门下拉选择后一键登录（仅 LINK_USE_MOCK=true 时渲染）。
 * 账号来自 lib/link/mock.ts：部长 B11111111（软件研发部）/ B44444444（办公室）。
 */
test.describe("mock login", () => {
  test("picks identity and department, then signs in", async ({ page }) => {
    await page.context().clearCookies();
    await page.goto("/login");

    await expect(page.getByText("使用测试帐号登入")).toBeVisible();
    await expect(page.getByText(/将使用 B11111111 · 陈屹/)).toBeVisible();

    /* 切换部门 → 账号随之切换 */
    await page.locator("#mock-login-department").click();
    await page.getByRole("option", { name: "办公室", exact: true }).click();
    await expect(page.getByText(/将使用 B44444444 · 邵晨/)).toBeVisible();

    /* 切换身份 → 部门/账号选项重算 */
    await page.locator("#mock-login-role").click();
    await page.getByRole("option", { name: "新同学", exact: true }).click();
    await expect(page.getByText(/将使用 B00040004 · 王思远/)).toBeVisible();

    /* 回到部长 + 办公室并登录 */
    await page.locator("#mock-login-role").click();
    await page.getByRole("option", { name: "部长", exact: true }).click();
    await page.locator("#mock-login-department").click();
    await page.getByRole("option", { name: "办公室", exact: true }).click();
    await page.getByRole("button", { name: "登录", exact: true }).click();

    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByText("邵晨").first()).toBeVisible();
  });
});
