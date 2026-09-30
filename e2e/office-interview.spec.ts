import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { Client } from "pg";
import { signInAs } from "./session";

/* 使用没有历史报名记录的 mock 账号（种子数据的办公类报名都在 uid 3-10），
   避免与 demo 种子数据互相干扰「办公类最多两条报名」的名额 */
const candidate = { uid: 11, role: 2, name: "讲师二" };

const SLOT_OPTIONS = [
  { label: "13:00-14:00" },
  { label: "14:00-15:00" },
  { label: "时间冲突，约面时间QQ群中另行通知", isConflict: true },
];

const MAX_TWO_MESSAGE =
  "办公类部门面试最多同时报名两个部门，且必须是一个第一志愿和一个第二志愿。";

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
  let firstFlowId = 0;
  let secondFlowId = 0;
  let thirdFlowId = 0;
  let firstFlowTitle = "";
  let secondFlowTitle = "";
  let thirdFlowTitle = "";

  /* 每个办公部门一条独立流程：department 即报名归属，不再有 group_options/group_departments */
  const insertOfficeFlow = async (title: string, department: string) => {
    const now = Date.now();
    const flowResult = await database.query<{ id: number }>(
      `insert into flow
         (title, description, type, owner_id, started_at, ended_at, department,
          group_options, group_departments, slot_options)
       values ($1, $2, 'office_interview', $3, $4, $5, $6, NULL, NULL, $7::jsonb)
       returning id`,
      [
        title,
        "仅用于验证办公类部门面试报名（志愿类型 + 面试时段）的临时数据。",
        1,
        new Date(now - 60 * 60 * 1000),
        new Date(now + 24 * 60 * 60 * 1000),
        department,
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
        choice: number | null;
        round: number | null;
        department: string | null;
        apply_group: string | null;
        portfolio_link: string | null;
      }>(
        `select fk_flow_id, progress_status, interview_slot, choice, round,
                department, apply_group, portfolio_link
         from user_flow
         where fk_user_id = $1 and fk_flow_id = any($2::int[])
         order by id`,
        [candidate.uid, createdFlowIds],
      )
    ).rows;

  test.beforeAll(async () => {
    database = await connectDatabase();

    const stamp = Date.now();
    firstFlowTitle = `E2E 办公流程甲 ${stamp}`;
    secondFlowTitle = `E2E 办公流程乙 ${stamp}`;
    thirdFlowTitle = `E2E 办公流程丙 ${stamp}`;
    firstFlowId = await insertOfficeFlow(firstFlowTitle, "office");
    secondFlowId = await insertOfficeFlow(secondFlowTitle, "publicity");
    thirdFlowId = await insertOfficeFlow(thirdFlowTitle, "liaison");
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

  const openRegisterDialog = async (page: Page, flowTitle: string) => {
    await page.goto("/dashboard/user-flow");
    await page.getByRole("button", { name: "提交报名" }).click();
    await page.getByRole("combobox").first().click();
    await page.getByRole("option", { name: new RegExp(flowTitle) }).click();
  };

  const fillOfficeRegistration = async (
    page: Page,
    volunteer: "第一志愿" | "第二志愿",
    slot?: string,
  ) => {
    await page.locator("#volunteer-choice").click();
    await page.getByRole("option", { name: volunteer, exact: true }).click();
    if (slot) {
      await page.locator("#interview-slot").click();
      await page.getByRole("option", { name: slot, exact: true }).click();
    }
    /* 办公类部门面试没有投递组别，也不收集作品链接/作品简介 */
    await expect(page.locator("#portfolio-link")).toHaveCount(0);
    await expect(page.locator("#apply-group-0")).toHaveCount(0);
  };

  test("registers the first volunteer type with the interview slot", async ({
    page,
  }) => {
    await signInAs(page.context(), candidate);
    await openRegisterDialog(page, firstFlowTitle);
    await fillOfficeRegistration(page, "第一志愿", "13:00-14:00");
    await page.getByRole("button", { name: "确认报名" }).click();

    await expect
      .poll(async () => (await officeRegistrations()).length)
      .toBe(1);
    const [registration] = await officeRegistrations();
    expect(registration).toMatchObject({
      fk_flow_id: firstFlowId,
      progress_status: "ongoing",
      choice: 1,
      round: 1,
      department: "office",
      interview_slot: "13:00-14:00",
      /* 办公类流程不落库投递组别与作品链接 */
      apply_group: null,
      portfolio_link: null,
    });
  });

  test("blocks a second first-choice office registration", async ({ page }) => {
    await signInAs(page.context(), candidate);
    await openRegisterDialog(page, secondFlowTitle);
    await fillOfficeRegistration(page, "第一志愿", "14:00-15:00");
    await page.getByRole("button", { name: "确认报名" }).click();

    await expect(
      page.locator("[data-sonner-toast]", {
        hasText: "您已有进行中的第一志愿办公类报名，请选择第二志愿。",
      }),
    ).toBeVisible();
    expect((await officeRegistrations()).length).toBe(1);
  });

  test("registers the second volunteer type in another office flow", async ({
    page,
  }) => {
    await signInAs(page.context(), candidate);
    await openRegisterDialog(page, secondFlowTitle);
    await fillOfficeRegistration(page, "第二志愿", "14:00-15:00");
    await page.getByRole("button", { name: "确认报名" }).click();

    await expect
      .poll(async () => (await officeRegistrations()).length)
      .toBe(2);
    const registrations = await officeRegistrations();
    expect(registrations).toEqual([
      expect.objectContaining({
        fk_flow_id: firstFlowId,
        choice: 1,
        department: "office",
        round: 1,
      }),
      {
        fk_flow_id: secondFlowId,
        progress_status: "ongoing",
        choice: 2,
        round: 1,
        department: "publicity",
        interview_slot: "14:00-15:00",
        apply_group: null,
        portfolio_link: null,
      },
    ]);
  });

  test("blocks a third office registration while two are ongoing", async ({
    page,
  }) => {
    await signInAs(page.context(), candidate);

    /* 已有一条第一志愿、一条第二志愿：第三个部门一律拒绝 */
    await openRegisterDialog(page, thirdFlowTitle);
    await fillOfficeRegistration(page, "第一志愿", "13:00-14:00");
    await page.getByRole("button", { name: "确认报名" }).click();

    await expect(
      page.locator("[data-sonner-toast]", { hasText: MAX_TWO_MESSAGE }),
    ).toBeVisible();
    expect((await officeRegistrations()).length).toBe(2);
    expect(thirdFlowId).toBeGreaterThan(0);
  });

  test("blocks the third office registration for the second volunteer type too", async ({
    page,
  }) => {
    await signInAs(page.context(), candidate);

    await openRegisterDialog(page, thirdFlowTitle);
    await fillOfficeRegistration(page, "第二志愿", "14:00-15:00");
    await page.getByRole("button", { name: "确认报名" }).click();

    await expect(
      page.locator("[data-sonner-toast]", { hasText: MAX_TWO_MESSAGE }),
    ).toBeVisible();
    expect(
      (await officeRegistrations()).map((row) => row.fk_flow_id),
    ).toEqual([firstFlowId, secondFlowId]);
  });
});
