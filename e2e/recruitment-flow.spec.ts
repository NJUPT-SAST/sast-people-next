import { expect, test, type BrowserContext } from "@playwright/test";
import { Client } from "pg";
import { SignJWT } from "jose";

const sessionSecret = process.env.SESSION_SECRET ?? "playwright-session-secret";
const candidateId = 8;
let database: Client;
let flowId: number;
let flowTitle: string;

async function createCandidateSessionCookie() {
  const encodedKey = new TextEncoder().encode(sessionSecret);
  return new SignJWT({
    uid: candidateId,
    role: 0,
    name: "Demo Freshman E",
    expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(encodedKey);
}

async function signInAsCandidate(context: BrowserContext) {
  await context.addCookies([
    {
      name: "session",
      value: await createCandidateSessionCookie(),
      domain: "127.0.0.1",
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
      secure: false,
    },
  ]);
}

test.describe("recruitment registration", () => {
  test.beforeAll(async () => {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error("DATABASE_URL is required for recruitment E2E tests");
    }

    database = new Client({ connectionString: databaseUrl });
    await database.connect();

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
      if (flowId) {
        await database.query("delete from flow where id = $1", [flowId]);
      }
      await database.end();
    }
  });

  test("candidate can register for an active flow and see it immediately", async ({
    page,
    context,
  }) => {
    await signInAsCandidate(context);

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
          [flowId, candidateId],
        );
        return Number(result.rows[0]?.count ?? 0);
      })
      .toBe(1);
  });
});
