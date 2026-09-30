import { expect, test } from "@playwright/test";
import { Client } from "pg";
import { signInAs } from "./session";

/**
 * 办公类「最终去向」：同一候选人通过两个办公部门时，部长团评议可在结果发布前指定归属部门
 * （默认按第一志愿优先自动归属）。此用例覆盖名单里的选择器与落库/复位。
 */

const officeManager = { uid: 213, role: 3, name: "邵晨", department: "office" };
const candidate = { uid: 204, role: 1, name: "何书宁", department: "software" };

async function connectDatabase() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required for office final destination E2E tests");
  }
  const database = new Client({ connectionString: databaseUrl });
  await database.connect();
  return database;
}

test.describe("office final destination", () => {
  let database: Client;
  const createdFlowIds: number[] = [];
  const createdUserFlowIds: number[] = [];
  let officeFlowId = 0;
  let publicityFlowId = 0;

  const insertOfficeFlow = async (title: string, department: string) => {
    const now = Date.now();
    const flowResult = await database.query<{ id: number }>(
      `insert into flow
         (title, description, type, owner_id, started_at, ended_at, department)
       values ($1, $2, 'office_interview', $3, $4, $5, $6)
       returning id`,
      [
        title,
        "仅用于验证办公类最终去向的临时数据。",
        1,
        new Date(now - 60 * 60 * 1000),
        new Date(now + 7 * 24 * 60 * 60 * 1000),
        department,
      ],
    );
    const flowId = flowResult.rows[0]?.id ?? 0;
    if (!flowId) throw new Error("Failed to create the temporary office flow");
    const steps = await database.query<{ id: number }>(
      `insert into flow_step (title, description, type, "order", fk_flow_id)
       values
         ('报名', '', 'registering', 1, $1),
         ('一面面试', '', 'checking', 2, $1),
         ('二面面试', '', 'checking', 3, $1),
         ('结果确认', '', 'finished', 4, $1)
       returning id`,
      [flowId],
    );
    createdFlowIds.push(flowId);
    return { flowId, resultStepId: steps.rows[3]?.id ?? 0 };
  };

  test.beforeAll(async () => {
    database = await connectDatabase();
    const office = await insertOfficeFlow(
      `E2E 最终去向（办公室）${Date.now()}`,
      "office",
    );
    const publicity = await insertOfficeFlow(
      `E2E 最终去向（科宣部）${Date.now()}`,
      "publicity",
    );
    officeFlowId = office.flowId;
    publicityFlowId = publicity.flowId;

    const rows = await database.query<{ id: number }>(
      `insert into user_flow
         (progress_status, fk_current_step_id, round, choice, fk_flow_id, fk_user_id, department)
       values
         ('passed', $1, 2, 1, $2, $5, 'office'),
         ('passed', $3, 2, 2, $4, $5, 'publicity')
       returning id`,
      [
        office.resultStepId,
        officeFlowId,
        publicity.resultStepId,
        publicityFlowId,
        candidate.uid,
      ],
    );
    createdUserFlowIds.push(...rows.rows.map((row) => row.id));
  });

  test.afterAll(async () => {
    if (createdFlowIds.length > 0) {
      await database.query(
        "delete from email_delivery where fk_flow_id = any($1::int[])",
        [createdFlowIds],
      );
      await database.query(
        "delete from user_flow where id = any($1::int[])",
        [createdUserFlowIds],
      );
      await database.query(
        "delete from flow_step where fk_flow_id = any($1::int[])",
        [createdFlowIds],
      );
      await database.query("delete from flow where id = any($1::int[])", [
        createdFlowIds,
      ]);
    }
    await database.end();
  });

  test("manager sets and clears the final destination from the roster", async ({
    page,
  }) => {
    await signInAs(page.context(), officeManager);
    await page.goto(`/dashboard/interviews?flowId=${officeFlowId}`);

    await page.getByRole("button", { name: "查看完整名单" }).click();
    const select = page.getByLabel(`设置 ${candidate.name} 的最终去向`);
    await expect(select).toBeVisible();
    /* 默认自动（第一志愿优先） */
    await expect(select).toContainText("自动");

    await select.click();
    await page.getByRole("option", { name: /科宣部（第二志愿）/ }).click();
    await expect(
      page.locator("[data-sonner-toast]", {
        hasText: "最终去向已设为 科宣部",
      }),
    ).toBeVisible();

    await expect
      .poll(async () => {
        const result = await database.query<{ final_department: string | null }>(
          "select final_department from user_flow where id = any($1::int[])",
          [createdUserFlowIds],
        );
        return result.rows.map((row) => row.final_department);
      })
      .toEqual(["publicity", "publicity"]);

    /* 复位为自动 */
    await select.click();
    await page.getByRole("option", { name: /^自动（/ }).click();
    await expect
      .poll(async () => {
        const result = await database.query<{ final_department: string | null }>(
          "select final_department from user_flow where id = any($1::int[])",
          [createdUserFlowIds],
        );
        return result.rows.map((row) => row.final_department);
      })
      .toEqual([null, null]);
    expect(publicityFlowId).toBeGreaterThan(0);
  });
});
