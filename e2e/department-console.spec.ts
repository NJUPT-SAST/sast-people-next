import { expect, test } from "@playwright/test";
import { Client } from "pg";
import { signInAs } from "./session";

const admin = { uid: 1, role: 4, name: "管理员" };

/* Link 部门清单的本地副本：控制台在一个人都还没归属过时也要能把它们列出来 */
const DEPARTMENT_CATALOGUE = [
  { key: "software", label: "软件研发部" },
  { key: "media", label: "多媒体部" },
  { key: "electronics", label: "电子部" },
  { key: "office", label: "办公室" },
  { key: "liaison", label: "外联部" },
  { key: "publicity", label: "科宣部" },
  { key: "competition", label: "赛事部" },
];

async function connectDatabase() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required for department console E2E tests");
  }
  const database = new Client({ connectionString: databaseUrl });
  await database.connect();
  return database;
}

test.describe("department console", () => {
  let database: Client;
  let flowId = 0;
  let flowTitle = "";

  test.beforeAll(async () => {
    database = await connectDatabase();
    flowTitle = `E2E 部门控制台流程 ${Date.now()}`;
    /* 未归属部门的流程：归属下拉里只有「全局」+「手填」是最初的线上问题 */
    const inserted = await database.query<{ id: number }>(
      "insert into flow (title, type, owner_id) values ($1, 'recruitment', $2) returning id",
      [flowTitle, 1],
    );
    flowId = inserted.rows[0].id;
  });

  test.afterAll(async () => {
    if (flowId) await database.query("delete from flow where id = $1", [flowId]);
    await database.end();
  });

  test("lists the Link department catalogue before anything is attributed", async ({
    page,
  }) => {
    await signInAs(page.context(), admin);
    await page.goto("/dashboard/departments");

    /* 部门概览：目录里的部门即使 0 条数据也要占一行 */
    await expect(page.getByText("暂无部门归属数据")).toBeHidden();
    for (const { label } of DEPARTMENT_CATALOGUE) {
      await expect(page.getByRole("cell", { name: label }).first()).toBeVisible();
    }

    /* 流程归属：下拉里能直接选到目录部门，而不是只剩「全局」+「手填新部门」 */
    await page.getByRole("tab", { name: /流程归属/ }).click();
    const row = page.getByRole("row").filter({ hasText: flowTitle });
    await row.getByRole("combobox").click();
    for (const { key, label } of DEPARTMENT_CATALOGUE) {
      await expect(page.getByRole("option", { name: `${label}（${key}）` })).toBeVisible();
    }
    await page.keyboard.press("Escape");
  });

  test("概览统计在归类后立即更新", async ({ page }) => {
    await signInAs(page.context(), admin);
    await page.goto("/dashboard/departments");

    const softwareRow = page.getByRole("row").filter({ hasText: "软件研发部" });
    const before = Number(await softwareRow.getByRole("cell").nth(2).innerText());

    await page.getByRole("tab", { name: /流程归属/ }).click();
    const flowRow = page.getByRole("row").filter({ hasText: flowTitle });
    await flowRow.getByRole("combobox").click();
    await page.getByRole("option", { name: "软件研发部（software）" }).click();
    await expect(flowRow.getByRole("combobox")).toContainText("软件研发部（software）");

    /* 归属写入后概览的流程数要跟着走，不能停在页面刚打开时的快照 */
    await page.getByRole("tab", { name: /部门概览/ }).click();
    await expect(softwareRow.getByRole("cell").nth(2)).toHaveText(String(before + 1));
  });
});
