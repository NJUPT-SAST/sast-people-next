import { expect, test } from "@playwright/test";
import { Client } from "pg";
import { signInAs } from "./session";

/**
 * 面试改期申请：候选人对已预约的飞书日程申请新时间（技术部门，讲师审批）。
 * 覆盖：申请理由必填、改约列表只对预约讲师显示、暂不改期需填写说明 + 邮件记录。
 * 办公类时段调整已下线（部长在面试管理页直接改），不在本用例覆盖范围内。
 */

const candidate = { uid: 11, role: 2, name: "讲师二", department: "software" };
const softwareLecturer = { uid: 202, role: 2, name: "周礼", department: "software" };

const beijingInputFormatter = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Asia/Shanghai",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/** Date → datetime-local 输入值（北京时间） */
const toBeijingInput = (date: Date) =>
  beijingInputFormatter.format(date).replace(" ", "T");

async function connectDatabase() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required for interview reschedule E2E tests");
  }
  const database = new Client({ connectionString: databaseUrl });
  await database.connect();
  return database;
}

test.describe("interview reschedule requests", () => {
  let database: Client;
  const createdFlowIds: number[] = [];
  const createdUserFlowIds: number[] = [];
  let techFlowId = 0;
  let otherTechFlowId = 0;
  let techFlowTitle = "";
  let otherTechFlowTitle = "";
  let techUserFlowId = 0;
  let scheduleId = 0;
  const requestedStartsAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);

  const insertTechFlow = async (title: string) => {
    const now = Date.now();
    const flowResult = await database.query<{ id: number }>(
      `insert into flow
         (title, description, type, owner_id, started_at, ended_at, department)
       values ($1, $2, 'woc', $3, $4, $5, 'software')
       returning id`,
      [
        title,
        "仅用于验证面试改期申请的临时数据。",
        1,
        new Date(now - 60 * 60 * 1000),
        new Date(now + 7 * 24 * 60 * 60 * 1000),
      ],
    );
    const flowId = flowResult.rows[0]?.id ?? 0;
    if (!flowId) throw new Error("Failed to create the temporary technical flow");

    const steps = await database.query<{ id: number }>(
      `insert into flow_step (title, description, type, "order", fk_flow_id)
       values
         ('报名', '', 'registering', 1, $1),
         ('讲师审核', '', 'checking', 2, $1),
         ('管理员审核', '', 'finished', 3, $1)
       returning id`,
      [flowId],
    );
    createdFlowIds.push(flowId);
    return { flowId, checkingStepId: steps.rows[1]?.id ?? 0 };
  };

  test.beforeAll(async () => {
    database = await connectDatabase();

    techFlowTitle = `E2E 技术改期流程 ${Date.now()}`;
    const tech = await insertTechFlow(techFlowTitle);
    techFlowId = tech.flowId;
    otherTechFlowTitle = `E2E 技术改期流程二 ${Date.now()}`;
    otherTechFlowId = (await insertTechFlow(otherTechFlowTitle)).flowId;

    const [techUserFlow] = (
      await database.query<{ id: number }>(
        `insert into user_flow
           (progress_status, apply_group, fk_current_step_id, fk_flow_id, fk_user_id, department)
         values ('ongoing', NULL, $1, $2, $3, 'software')
         returning id`,
        [tech.checkingStepId, techFlowId, candidate.uid],
      )
    ).rows;
    techUserFlowId = techUserFlow?.id ?? 0;

    const [schedule] = (
      await database.query<{ id: number }>(
        `insert into interview_schedule
           (fk_user_flow_id, fk_organizer_id, provider, provider_calendar_id,
            provider_event_id, meeting_link, summary, description, location,
            starts_at, ends_at, timezone, status)
         values ($1, $2, 'feishu', 'primary', $3, 'https://vc.feishu.cn/j/e2e-reschedule',
                 $4, 'E2E 改期申请演示', '大学生活动中心 101',
                 now() + interval '2 days', now() + interval '2 days 30 minutes',
                 'Asia/Shanghai', 'created')
         returning id`,
        [
          techUserFlowId,
          softwareLecturer.uid,
          `e2e-reschedule-${Date.now()}`,
          `${techFlowTitle} 线下面试`,
        ],
      )
    ).rows;
    scheduleId = schedule?.id ?? 0;
    createdUserFlowIds.push(techUserFlowId);
  });

  test.afterAll(async () => {
    if (createdFlowIds.length > 0) {
      await database.query(
        "delete from email_delivery where fk_flow_id = any($1::int[])",
        [createdFlowIds],
      );
      await database.query(
        "delete from interview_slot_change_request where fk_user_flow_id = any($1::int[])",
        [createdUserFlowIds],
      );
      await database.query(
        "delete from interview_schedule where fk_user_flow_id = any($1::int[])",
        [createdUserFlowIds],
      );
      await database.query("delete from user_flow where id = any($1::int[])", [
        createdUserFlowIds,
      ]);
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

  test("candidate submits a new interview time with a mandatory reason", async ({
    page,
  }) => {
    await signInAs(page.context(), candidate);
    await page.goto("/dashboard/user-flow");

    const card = page
      .locator('[data-slot="card"]')
      .filter({ hasText: techFlowTitle });
    await expect(card.getByText(/面试时间：/).first()).toBeVisible();

    await card.getByRole("button", { name: "申请修改面试时间" }).click();
    const timeInput = page.locator(`#slot-change-${techUserFlowId}`);
    const requestedTimeInput = toBeijingInput(requestedStartsAt);
    await timeInput.fill(requestedTimeInput);
    /* 申请理由必填：未填理由时不能提交 */
    await expect(page.getByRole("button", { name: "提交申请" })).toBeDisabled();
    await page.locator(`#slot-change-reason-${techUserFlowId}`).fill("课程冲突");
    await page.getByRole("button", { name: "提交申请" }).click();

    await expect(
      page.locator("[data-sonner-toast]", {
        hasText: "申请已提交，等待预约讲师处理",
      }),
    ).toBeVisible();
    await expect(card.getByText(/改约申请处理中/).first()).toBeVisible();

    const [request] = (
      await database.query<{
        requested_slot: string | null;
        requested_starts_at: Date | null;
        requested_ends_at: Date | null;
        fk_interview_schedule_id: number | null;
        reason: string;
        status: string;
      }>(
        `select requested_slot, requested_starts_at, requested_ends_at,
                fk_interview_schedule_id, reason, status
         from interview_slot_change_request
         where fk_user_flow_id = $1`,
        [techUserFlowId],
      )
    ).rows;

    expect(request?.status).toBe("pending");
    expect(request?.reason).toBe("课程冲突");
    expect(request?.requested_slot).toBeNull();
    expect(request?.fk_interview_schedule_id).toBe(scheduleId);
    /* datetime-local 精确到分钟：期望值与输入值同为北京时间 */
    const expectedStartsAt = new Date(`${requestedTimeInput}:00+08:00`).getTime();
    expect(request?.requested_starts_at?.getTime()).toBe(expectedStartsAt);
    /* 时长沿用原日程：30 分钟 */
    expect(
      (request?.requested_ends_at?.getTime() ?? 0) -
        (request?.requested_starts_at?.getTime() ?? 0),
    ).toBe(30 * 60 * 1000);
  });

  test("lecturer sees the request only under its own flow and rejects it with a reason", async ({
    page,
  }) => {
    await signInAs(page.context(), softwareLecturer);

    /* 其他流程的页面不显示该申请：审批列表按流程绑定 */
    await page.goto(`/dashboard/interviews?flowId=${otherTechFlowId}`);
    await expect(page.getByText(otherTechFlowTitle).first()).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "面试改约申请" }),
    ).toHaveCount(0);

    await page.goto(`/dashboard/interviews?flowId=${techFlowId}`);
    const panel = page.locator("section", {
      has: page.getByRole("heading", { name: "面试改约申请" }),
    });
    await expect(panel).toBeVisible();
    await expect(panel.getByText(techFlowTitle).first()).toBeVisible();
    await expect(panel.getByText(candidate.name).first()).toBeVisible();

    await panel.getByRole("button", { name: "暂不改期" }).click();
    /* 暂不改期的说明必填：未填说明时不能确认 */
    await expect(page.getByRole("button", { name: "确认暂不改期" })).toBeDisabled();
    await page.getByLabel("说明（必填）").fill("该时间讲师已有其他安排");
    await page.getByRole("button", { name: "确认暂不改期" }).click();

    await expect(
      page.locator("[data-sonner-toast]", {
        hasText: "已告知候选人暂不改期，面试仍按原时间进行",
      }),
    ).toBeVisible();

    const [request] = (
      await database.query<{ status: string; review_note: string | null }>(
        `select status, review_note
         from interview_slot_change_request
         where fk_user_flow_id = $1`,
        [techUserFlowId],
      )
    ).rows;
    expect(request?.status).toBe("rejected");
    expect(request?.review_note).toBe("该时间讲师已有其他安排");

    const deliveries = await database.query<{ template_key: string }>(
      `select template_key
       from email_delivery
       where fk_user_flow_id = $1 and template_key = 'interview.schedule.change.rejected'`,
      [techUserFlowId],
    );
    expect(deliveries.rows.length).toBeGreaterThan(0);
  });
});
