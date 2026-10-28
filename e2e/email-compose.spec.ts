import { expect, test } from "@playwright/test";
import { signInAs } from "./session";

test.describe("email center compose", () => {
  test("saves, reloads and deletes a custom email draft", async ({
    page,
    context,
  }) => {
    await signInAs(context, {
      uid: 1,
      role: 4,
      name: "管理员",
      department: "software",
    });

    await page.goto("/dashboard/emails?tab=compose");
    await expect(page.getByRole("heading", { name: "写新邮件" })).toBeVisible();

    const subject = `E2E 自定义邮件 ${Date.now()}`;
    await page.getByRole("button", { name: "添加", exact: true }).first().click();
    await expect(page.getByText(/已选 1 人/)).toBeVisible();

    await page.locator("#custom-email-subject").fill(subject);
    await page.locator(".tiptap").click();
    await page.keyboard.type("这是一封由 E2E 保存的自定义邮件草稿。");

    await page.getByRole("button", { name: "存草稿" }).click();
    await expect(page.getByText("草稿已保存")).toBeVisible();

    /* 刷新后草稿仍在左侧草稿箱，并能按 URL 深链重新打开 */
    await page.goto(`/dashboard/emails?tab=compose`);
    const draftItem = page.getByRole("button", {
      name: new RegExp(subject),
    });
    await expect(draftItem).toBeVisible();
    await draftItem.click();
    await expect(page.locator("#custom-email-subject")).toHaveValue(subject);

    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "删除", exact: true }).click();
    await expect(page.getByText("邮件已删除")).toBeVisible();
    await expect(draftItem).toHaveCount(0);
  });
});