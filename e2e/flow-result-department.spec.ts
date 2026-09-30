import { expect, test } from "@playwright/test";
import { Client } from "pg";
import { signInAs } from "./session";

/* 软件研发部部长（mock 账号 B11111111）与一名初始无部门的新同学（B00040004） */
const softwareManager = { uid: 201, role: 3, name: "陈屹", department: "software" };
const candidate = { uid: 4, role: 0, name: "王思远" };

test.describe("flow result publication syncs member department", () => {
  let database: Client;
  let flowId = 0;
  let flowTitle = "";

  const cleanup = async () => {
    if (flowId) {
      await database.query(
        "delete from email_delivery where fk_flow_id = $1",
        [flowId],
      );
      await database.query("delete from email_batch where fk_flow_id = $1", [
        flowId,
      ]);
      await database.query(
        "delete from flow_result_publication where fk_flow_id = $1",
        [flowId],
      );
      await database.query("delete from user_flow where fk_flow_id = $1", [
        flowId,
      ]);
      await database.query("delete from flow_step where fk_flow_id = $1", [
        flowId,
      ]);
      await database.query("delete from flow where id = $1", [flowId]);
      flowId = 0;
    }
  };

  test.beforeAll(async () => {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error("DATABASE_URL is required for department sync E2E tests");
    }
    database = new Client({ connectionString: databaseUrl });
    await database.connect();

    flowTitle = `E2E 部门归属同步 ${Date.now()}`;
    const now = Date.now();
    const flowResult = await database.query<{ id: number }>(
      `insert into flow (title, description, type, owner_id, started_at, ended_at, department)
       values ($1, $2, 'recruitment_exemption', $3, $4, $5, 'software')
       returning id`,
      [
        flowTitle,
        "仅用于验证「发布结果自动同步部门归属」的临时数据。",
        1,
        new Date(now - 24 * 60 * 60 * 1000),
        new Date(now + 24 * 60 * 60 * 1000),
      ],
    );
    flowId = flowResult.rows[0]?.id ?? 0;
    if (!flowId) throw new Error("Failed to create the temporary flow");

    const steps = await database.query<{ id: number }>(
      `insert into flow_step (title, description, type, "order", fk_flow_id)
       values
         ('报名', '', 'registering', 1, $1),
         ('讲师审核', '', 'checking', 2, $1),
         ('管理员审核', '', 'finished', 3, $1)
       returning id`,
      [flowId],
    );
    await database.query(
      `insert into user_flow (progress_status, fk_current_step_id, fk_flow_id, fk_user_id, department)
       values ('passed', $1, $2, $3, 'software')`,
      [steps.rows[2]?.id ?? null, flowId, candidate.uid],
    );
  });

  test.afterAll(async () => {
    await cleanup();
    await database.end();
  });

  test("publishes results and assigns the department through Link", async ({
    page,
  }) => {
    await signInAs(page.context(), softwareManager);
    await page.goto(`/dashboard/interviews?flowId=${flowId}`);

    await page.getByRole("button", { name: "确认并发布结果" }).click();
    const dialog = page.getByRole("dialog");
    await dialog
      .getByText("我已在邮件中心核对本年度通过和不通过邮件模板，确认内容无误。")
      .click();
    await dialog.getByRole("button", { name: "确认发布" }).click();

    await expect(
      page.getByRole("button", { name: "结果已发布" }),
    ).toBeVisible({ timeout: 30_000 });

    const publication = await database.query<{ status: string }>(
      "select status from flow_result_publication where fk_flow_id = $1",
      [flowId],
    );
    expect(publication.rows[0]?.status).toBe("published");

    /* 发布后成员身份同步回 Link（mock）：新同学自动归属到软件研发部 */
    await signInAs(page.context(), candidate);
    await page.goto("/dashboard");
    await expect(page.getByText("所属部门")).toBeVisible();
    await expect(page.getByText("软件研发部").first()).toBeVisible();
  });
});
