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

const OFFICE_GROUPS = ["办公室", "科宣部", "外联部", "赛事部"];
const OFFICE_MAPPING: Record<string, string> = {
  办公室: "office",
  科宣部: "publicity",
  外联部: "liaison",
  赛事部: "competition",
};

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

  test("creates the shared office flow with departments and slot options", async ({
    page,
  }) => {
    const title = `E2E 办公类共享流程 ${Date.now()}`;

    await signInAs(page.context(), admin);
    await page.goto("/dashboard/flow");
    await page.getByRole("button", { name: "添加流程" }).click();

    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("流程名称").fill(title);
    await dialog.getByLabel("流程描述").fill("E2E 验证办公类共享流程配置。");

    await dialog.getByRole("combobox").nth(0).click();
    await page.getByRole("option", { name: "办公类部门面试招新" }).click();

    await dialog
      .getByLabel("可投递的办公部门")
      .fill(OFFICE_GROUPS.join("\n"));

    /* 组别 → 部门映射：四个办公部门各选一次（办公类流程不显示归属部门） */
    for (let index = 0; index < OFFICE_GROUPS.length; index += 1) {
      const group = OFFICE_GROUPS[index];
      await dialog.getByRole("combobox").nth(index + 1).click();
      await page.getByRole("option", { name: group, exact: true }).click();
    }

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
      department: null,
      group_options: OFFICE_GROUPS,
      group_departments: OFFICE_MAPPING,
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
