import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { Client } from "pg";
import { signInAs } from "./session";

/* 使用没有历史报名记录的 mock 账号，避免与 demo 种子数据互相干扰 */
const candidate = { uid: 11, role: 2, name: "讲师二" };

const SLOT_OPTIONS = [
  { label: "13:00-14:00" },
  { label: "14:00-15:00" },
  { label: "时间冲突，约面时间QQ群中另行通知", isConflict: true },
];

async function connectDatabase() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required for office interview E2E tests");
  }
  const database = new Client({ connectionString: databaseUrl });
  await database.connect();
  return database;
}

test.describe("office interview registration", () => {
  let database: Client;
  const createdFlowIds: number[] = [];
  let primaryFlowId = 0;
  let otherFlowId = 0;
  let primaryTitle = "";

  const insertSharedOfficeFlow = async (title: string) => {
    const now = Date.now();
    const flowResult = await database.query<{ id: number }>(
      `insert into flow
         (title, description, type, owner_id, started_at, ended_at, department,
          group_options, group_departments, slot_options)
       values ($1, $2, 'office_interview', $3, $4, $5, NULL, $6::jsonb, $7::jsonb, $8::jsonb)
       returning id`,
      [
        title,
        "仅用于验证办公类共享流程报名主流程的临时数据。",
        1,
        new Date(now - 60 * 60 * 1000),
        new Date(now + 24 * 60 * 60 * 1000),
        JSON.stringify(["办公室", "科宣部", "外联部", "赛事部"]),
        JSON.stringify({
          办公室: "office",
          科宣部: "publicity",
          外联部: "liaison",
          赛事部: "competition",
        }),
        JSON.stringify(SLOT_OPTIONS),
      ],
    );
    const flowId = flowResult.rows[0]?.id ?? 0;
    if (!flowId) {
      throw new Error("Failed to create the temporary office interview flow");
    }

    await database.query(
      `insert into flow_step (title, description, type, "order", fk_flow_id)
       values
         ('报名', '', 'registering', 1, $1),
         ('一面面试', '', 'checking', 2, $1),
         ('二轮面试', '', 'checking', 3, $1),
         ('结果确认', '', 'finished', 4, $1)`,
      [flowId],
    );
    createdFlowIds.push(flowId);
    return flowId;
  };

  const officeRegistrations = async () =>
    (
      await database.query<{
        fk_flow_id: number;
        progress_status: string | null;
        interview_slot: string | null;
        second_choice_department: string | null;
        apply_group: string | null;
        round: number | null;
        department: string | null;
      }>(
        `select fk_flow_id, progress_status, interview_slot, second_choice_department,
                apply_group, round, department
         from user_flow
         where fk_user_id = $1 and fk_flow_id = any($2::int[])
         order by id`,
        [candidate.uid, createdFlowIds],
      )
    ).rows;

  test.beforeAll(async () => {
    database = await connectDatabase();

    primaryTitle = `E2E 办公共享流程 ${Date.now()}`;
    primaryFlowId = await insertSharedOfficeFlow(primaryTitle);
    otherFlowId = await insertSharedOfficeFlow(`E2E 办公共享流程二 ${Date.now()}`);
  });

  test.afterAll(async () => {
    if (createdFlowIds.length > 0) {
      await database.query(
        "delete from user_flow where fk_flow_id = any($1::int[])",
        [createdFlowIds],
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

  const openRegisterDialog = async (
    page: Page,
    flowTitle: string,
  ) => {
    await page.goto("/dashboard/user-flow");
    await page.getByRole("button", { name: "提交报名" }).click();
    await page.getByRole("combobox").first().click();
    await page.getByRole("option", { name: new RegExp(flowTitle) }).click();
  };

  const fillOfficeRegistration = async (
    page: Page,
    firstChoice: string,
    secondChoice: string,
    slot: string,
  ) => {
    await page.locator("#first-choice-department").click();
    await page.getByRole("option", { name: firstChoice, exact: true }).click();
    await page.locator("#second-choice-department").click();
    await page.getByRole("option", { name: secondChoice, exact: true }).click();
    await page.locator("#interview-slot").click();
    await page.getByRole("option", { name: slot, exact: true }).click();
    await page.locator("#portfolio-link").fill("https://example.com/portfolio");
  };

  test("registers the shared office flow with first/second choice and slot", async ({
    page,
  }) => {
    await signInAs(page.context(), candidate);
    await openRegisterDialog(page, primaryTitle);
    await fillOfficeRegistration(page, "办公室", "科宣部", "13:00-14:00");
    await page.getByRole("button", { name: "确认报名" }).click();

    await expect
      .poll(async () => (await officeRegistrations()).length)
      .toBe(1);
    const [registration] = await officeRegistrations();
    expect(registration).toMatchObject({
      fk_flow_id: primaryFlowId,
      progress_status: "ongoing",
      apply_group: "办公室",
      department: "office",
      second_choice_department: "publicity",
      interview_slot: "13:00-14:00",
      round: 1,
    });
  });

  test("blocks a second registration in the same shared flow", async ({
    page,
  }) => {
    await signInAs(page.context(), candidate);
    await openRegisterDialog(page, primaryTitle);
    await fillOfficeRegistration(page, "科宣部", "外联部", "14:00-15:00");
    await page.getByRole("button", { name: "确认报名" }).click();

    await expect(
      page.locator("[data-sonner-toast]", {
        hasText: "您已报名该流程",
      }),
    ).toBeVisible();
    expect((await officeRegistrations()).length).toBe(1);
  });

  test("blocks registering another office flow while one is ongoing", async ({
    page,
  }) => {
    await signInAs(page.context(), candidate);
    await openRegisterDialog(page, `E2E 办公共享流程二`);
    await fillOfficeRegistration(page, "外联部", "办公室", "14:00-15:00");
    await page.getByRole("button", { name: "确认报名" }).click();

    await expect(
      page.locator("[data-sonner-toast]", {
        hasText: "办公类部门之间同时只能参加一个面试",
      }),
    ).toBeVisible();
    expect(
      (await officeRegistrations()).map((row) => row.fk_flow_id),
    ).toEqual([primaryFlowId]);
    expect(otherFlowId).toBeGreaterThan(0);
  });
});
