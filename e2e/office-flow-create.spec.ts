import { expect, test } from "@playwright/test";
import { Client } from "pg";
import { signInAs } from "./session";

const admin = { uid: 1, role: 4, name: "管理员", department: "software" };

async function connectDatabase() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required for office flow E2E tests");
  }
  const database = new Client({ connectionString: databaseUrl });
  await database.connect();
  return database;
}

/* 办公类部门面试招新：每条流程归属一个办公部门，仅额外配置面试时段 */
const OFFICE_DEPARTMENT = { key: "office", label: "办公室" };

test.describe("office interview flow creation", () => {
  let database: Client;
  let createdFlowId = 0;

  test.beforeAll(async () => {
    database = await connectDatabase();
  });

  test.afterAll(async () => {
    if (createdFlowId) {
      await database.query("delete from flow_step where fk_flow_id = $1", [
        createdFlowId,
      ]);
      await database.query("delete from flow where id = $1", [createdFlowId]);
    }
    await database.end();
  });

  test("creates an office flow for one department with slot options", async ({
    page,
  }) => {
    const title = `E2E 办公类流程 ${OFFICE_DEPARTMENT.label} ${Date.now()}`;

    await signInAs(page.context(), admin);
    await page.goto("/dashboard/flow");
    await page.getByRole("button", { name: "添加流程" }).click();

    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("流程名称").fill(title);
    await dialog.getByLabel("流程描述").fill("E2E 验证办公类流程配置。");

    await dialog.getByRole("combobox").nth(0).click();
    await page.getByRole("option", { name: "办公类部门面试招新" }).click();

    /* 归属部门与其它流程一致：管理员直接选择办公部门，不再有可投递部门映射 */
    await dialog.getByRole("combobox").nth(1).click();
    await page
      .getByRole("option", { name: OFFICE_DEPARTMENT.label, exact: true })
      .click();

    await dialog.locator("#add-flow-slots").fill("13:00-14:00\n14:00-15:00");
    await dialog.locator("#add-flow-slot-conflict").click();

    await dialog.locator('input[type="date"]').nth(0).fill("2026-10-01");
    await dialog.locator('input[type="time"]').nth(0).fill("13:00");
    await dialog.locator('input[type="date"]').nth(1).fill("2026-10-01");
    await dialog.locator('input[type="time"]').nth(1).fill("18:00");

    await dialog.getByRole("button", { name: "确认添加" }).click();

    await expect
      .poll(() => page.url())
      .toMatch(/\/dashboard\/flow\/edit\?id=\d+/);
    createdFlowId = Number(new URL(page.url()).searchParams.get("id"));

    const flowRow = await database.query<{
      type: string;
      department: string | null;
      group_options: string[] | null;
      group_departments: Record<string, string> | null;
      slot_options: Array<{ label: string; isConflict?: boolean }> | null;
    }>(
      "select type, department, group_options, group_departments, slot_options from flow where id = $1",
      [createdFlowId],
    );

    expect(flowRow.rows[0]).toMatchObject({
      type: "office_interview",
      department: OFFICE_DEPARTMENT.key,
      group_options: null,
      group_departments: null,
    });
    expect(flowRow.rows[0]?.slot_options).toEqual([
      { label: "13:00-14:00" },
      { label: "14:00-15:00" },
      { label: "时间冲突，约面时间QQ群中另行通知", isConflict: true },
    ]);

    const steps = await database.query<{ title: string; order: number }>(
      "select title, \"order\" from flow_step where fk_flow_id = $1 order by \"order\"",
      [createdFlowId],
    );
    expect(steps.rows.map((step) => step.title)).toEqual([
      "报名",
      "一面面试",
      "二轮面试",
      "结果确认",
    ]);
  });
});
