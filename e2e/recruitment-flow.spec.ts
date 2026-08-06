import { expect, test, type BrowserContext } from "@playwright/test";
import { Client } from "pg";
import { SignJWT } from "jose";

const sessionSecret = process.env.SESSION_SECRET ?? "playwright-session-secret";

const users = {
  admin: { uid: 1, role: 3, name: "Local Admin" },
  candidate: { uid: 8, role: 0, name: "Demo Freshman E" },
  outcomeCandidate: { uid: 4, role: 0, name: "Demo Freshman A" },
} as const;

async function createSessionCookie(user: {
  uid: number;
  role: number;
  name: string;
}) {
  const encodedKey = new TextEncoder().encode(sessionSecret);
  return new SignJWT({
    uid: user.uid,
    role: user.role,
    name: user.name,
    expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(encodedKey);
}

async function signInAs(
  context: BrowserContext,
  user: { uid: number; role: number; name: string },
) {
  await context.addCookies([
    {
      name: "session",
      value: await createSessionCookie(user),
      domain: "127.0.0.1",
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
      secure: false,
    },
  ]);
}

async function connectDatabase() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required for recruitment E2E tests");
  }
  const database = new Client({ connectionString: databaseUrl });
  await database.connect();
  return database;
}

/** Delete temporary E2E flow rows even when children lack ON DELETE CASCADE. */
async function deleteTemporaryFlow(database: Client, flowId: number) {
  if (!flowId) {
    return;
  }

  await database.query(
    `delete from interview_evaluation
     where fk_user_flow_id in (
       select id from user_flow where fk_flow_id = $1
     )`,
    [flowId],
  );
  await database.query(
    `delete from user_point
     where fk_user_flow_id in (
       select id from user_flow where fk_flow_id = $1
     )`,
    [flowId],
  );
  await database.query("delete from flow where id = $1", [flowId]);
}

test.describe("recruitment registration", () => {
  let database: Client;
  let flowId = 0;
  let flowTitle = "";

  test.beforeAll(async () => {
    database = await connectDatabase();

    flowTitle = `E2E 招新报名 ${Date.now()}`;
    const now = Date.now();
    const flowResult = await database.query<{ id: number }>(
      `insert into flow (title, description, type, owner_id, started_at, ended_at)
       values ($1, $2, 'recruitment', $3, $4, $5)
       returning id`,
      [
        flowTitle,
        "仅用于验证学生端招新报名主流程的临时数据。",
        1,
        new Date(now - 24 * 60 * 60 * 1000),
        new Date(now + 24 * 60 * 60 * 1000),
      ],
    );
    flowId = flowResult.rows[0]?.id ?? 0;
    if (!flowId) {
      throw new Error("Failed to create the temporary recruitment flow");
    }

    await database.query(
      `insert into flow_step (title, description, type, "order", fk_flow_id)
       values
         ($1, $2, 'registering', 1, $3),
         ($4, $5, 'checking', 2, $3)`,
      [
        "报名",
        "填写并提交招新报名。",
        flowId,
        "审核",
        "等待招新工作人员审核。",
      ],
    );
  });

  test.afterAll(async () => {
    if (database) {
      try {
        await deleteTemporaryFlow(database, flowId);
      } finally {
        await database.end();
      }
    }
  });

  test("candidate can register for an active flow and see it immediately", async ({
    page,
    context,
  }) => {
    await signInAs(context, users.candidate);

    await page.goto("/dashboard/user-flow");
    await expect(page.getByRole("button", { name: "提交报名" })).toBeEnabled();

    await page.getByRole("button", { name: "提交报名" }).click();
    await page.getByRole("combobox").click();
    await page.getByRole("option", { name: new RegExp(flowTitle) }).click();
    await page.getByRole("button", { name: "确认报名" }).click();

    await expect(page.getByText("报名成功")).toBeVisible();
    await expect(page.getByText(flowTitle)).toBeVisible();

    await expect
      .poll(async () => {
        const result = await database.query<{ count: string }>(
          "select count(*) from user_flow where fk_flow_id = $1 and fk_user_id = $2",
          [flowId, users.candidate.uid],
        );
        return Number(result.rows[0]?.count ?? 0);
      })
      .toBe(1);
  });
});

test.describe("recruitment written outcome", () => {
  let database: Client;
  let flowId = 0;
  let flowTitle = "";

  test.beforeAll(async () => {
    database = await connectDatabase();

    flowTitle = `E2E 成绩管理 ${Date.now()}`;
    const now = Date.now();
    const flowResult = await database.query<{ id: number }>(
      `insert into flow (title, description, type, owner_id, started_at, ended_at)
       values ($1, $2, 'recruitment', $3, $4, $5)
       returning id`,
      [
        flowTitle,
        "仅用于验证管理员设置通过/不通过的临时数据。",
        1,
        new Date(now - 24 * 60 * 60 * 1000),
        new Date(now + 24 * 60 * 60 * 1000),
      ],
    );
    flowId = flowResult.rows[0]?.id ?? 0;
    if (!flowId) {
      throw new Error("Failed to create the temporary written recruitment flow");
    }

    const steps = await database.query<{ id: number; order: number }>(
      `insert into flow_step (title, description, type, "order", fk_flow_id)
       values
         ($1, $2, 'registering', 1, $3),
         ($4, $5, 'judging', 2, $3),
         ($6, $7, 'finished', 3, $3)
       returning id, "order"`,
      [
        "报名",
        "报名",
        flowId,
        "批卷",
        "批卷",
        "录取确认",
        "录取确认",
      ],
    );
    const judgingStepId =
      steps.rows.find((step) => step.order === 2)?.id ?? 0;
    if (!judgingStepId) {
      throw new Error("Failed to create temporary flow steps");
    }

    const problem = await database.query<{ id: number }>(
      `insert into problem (title, score, fk_flow_step_id)
       values ($1, 100, $2)
       returning id`,
      ["E2E 题目", judgingStepId],
    );
    const problemId = problem.rows[0]?.id ?? 0;

    const userFlow = await database.query<{ id: number }>(
      `insert into user_flow (
         progress_status,
         fk_current_step_id,
         portfolio_link,
         fk_flow_id,
         fk_user_id
       )
       values ('ongoing', $1, null, $2, $3)
       returning id`,
      [judgingStepId, flowId, users.outcomeCandidate.uid],
    );
    const userFlowId = userFlow.rows[0]?.id ?? 0;
    if (!problemId || !userFlowId) {
      throw new Error("Failed to create temporary graded candidate");
    }

    await database.query(
      `insert into user_point (fk_user_flow_id, fk_problem_id, points, fk_judger_id)
       values ($1, $2, 88, 2)`,
      [userFlowId, problemId],
    );
  });

  test.afterAll(async () => {
    if (database) {
      try {
        await deleteTemporaryFlow(database, flowId);
      } finally {
        await database.end();
      }
    }
  });

  test("admin can mark a graded candidate as passed", async ({
    page,
    context,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await signInAs(context, users.admin);

    page.once("dialog", (dialog) => {
      void dialog.accept();
    });

    await page.goto(`/dashboard/recruitment?flowId=${flowId}`);
    await expect(page.getByText("按流程查看报名人员")).toBeVisible();
    await expect(page.getByText(flowTitle)).toBeVisible();

    // Desktop table and mobile cards both render the name in the DOM.
    const desktopRow = page.locator("tr", {
      hasText: users.outcomeCandidate.name,
    });
    await expect(desktopRow).toBeVisible();
    await desktopRow.getByLabel("Select row").check();
    await page.getByRole("button", { name: "设为通过" }).click();

    await expect(page.getByText("已设置为通过")).toBeVisible();

    await expect
      .poll(async () => {
        const result = await database.query<{ progress_status: string }>(
          `select progress_status
           from user_flow
           where fk_flow_id = $1 and fk_user_id = $2`,
          [flowId, users.outcomeCandidate.uid],
        );
        return result.rows[0]?.progress_status;
      })
      .toBe("passed");
  });
});

test.describe("recruitment evaluation approval", () => {
  let database: Client;
  let flowId = 0;
  let evaluationId = 0;
  let flowTitle = "";

  test.beforeAll(async () => {
    database = await connectDatabase();

    flowTitle = `E2E 面评终审 ${Date.now()}`;
    const now = Date.now();
    const flowResult = await database.query<{ id: number }>(
      `insert into flow (title, description, type, owner_id, started_at, ended_at)
       values ($1, $2, 'recruitment_exemption', $3, $4, $5)
       returning id`,
      [
        flowTitle,
        "仅用于验证管理员终审面评的临时数据。",
        1,
        new Date(now - 24 * 60 * 60 * 1000),
        new Date(now + 24 * 60 * 60 * 1000),
      ],
    );
    flowId = flowResult.rows[0]?.id ?? 0;
    if (!flowId) {
      throw new Error("Failed to create the temporary evaluation flow");
    }

    const steps = await database.query<{ id: number; order: number }>(
      `insert into flow_step (title, description, type, "order", fk_flow_id)
       values
         ($1, $2, 'registering', 1, $3),
         ($4, $5, 'checking', 2, $3),
         ($6, $7, 'finished', 3, $3)
       returning id, "order"`,
      ["报名", "报名", flowId, "讲师审核", "讲师审核", "管理员审核", "管理员审核"],
    );
    const checkingStepId =
      steps.rows.find((step) => step.order === 2)?.id ?? 0;
    if (!checkingStepId) {
      throw new Error("Failed to create temporary evaluation steps");
    }

    const userFlow = await database.query<{ id: number }>(
      `insert into user_flow (
         progress_status,
         fk_current_step_id,
         portfolio_link,
         fk_flow_id,
         fk_user_id
       )
       values ('ongoing', $1, $2, $3, $4)
       returning id`,
      [
        checkingStepId,
        "https://portfolio-e2e.example.com",
        flowId,
        users.candidate.uid,
      ],
    );
    const userFlowId = userFlow.rows[0]?.id ?? 0;
    if (!userFlowId) {
      throw new Error("Failed to create temporary evaluation candidate");
    }

    const evaluation = await database.query<{ id: number }>(
      `insert into interview_evaluation (
         fk_user_flow_id,
         fk_user_id,
         content,
         meeting_link,
         status
       )
       values ($1, 2, $2, $3, 'submitted')
       returning id`,
      [
        userFlowId,
        "E2E 面评内容：表达清晰，建议通过。",
        "https://memo.example.com/e2e-eval",
      ],
    );
    evaluationId = evaluation.rows[0]?.id ?? 0;
    if (!evaluationId) {
      throw new Error("Failed to create temporary evaluation");
    }
  });

  test.afterAll(async () => {
    if (database) {
      try {
        if (evaluationId) {
          await database.query(
            "delete from interview_evaluation where id = $1",
            [evaluationId],
          );
        }
        await deleteTemporaryFlow(database, flowId);
      } finally {
        await database.end();
      }
    }
  });

  test("admin can approve a submitted evaluation", async ({ page, context }) => {
    await signInAs(context, users.admin);

    await page.goto("/dashboard/approvals");
    await expect(page.getByText(flowTitle)).toBeVisible();
    await expect(
      page.getByText("E2E 面评内容：表达清晰，建议通过。"),
    ).toBeVisible();

    const evaluationCard = page.locator('[data-slot="card"]', {
      hasText: flowTitle,
    });
    await evaluationCard
      .filter({ hasText: "E2E 面评内容：表达清晰，建议通过。" })
      .getByRole("button", { name: "通过", exact: true })
      .click();

    await expect(page.getByText("面评已通过")).toBeVisible();

    await expect
      .poll(async () => {
        const result = await database.query<{ status: string }>(
          "select status from interview_evaluation where id = $1",
          [evaluationId],
        );
        return result.rows[0]?.status;
      })
      .toBe("approved");
  });
});
