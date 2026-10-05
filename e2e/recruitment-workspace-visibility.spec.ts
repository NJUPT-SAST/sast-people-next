import { expect, test } from "@playwright/test";
import { Client } from "pg";
import { signInAs } from "./session";

/* Link mock 里的固定账号：笔试候选人拿它的 QQ 做断言（讲师要能按 QQ 联系候选人） */
const CANDIDATE = { uid: 1, name: "管理员", qq: "3812047" };
const lecturer = { uid: 20, role: 2, name: "讲师", department: "software" };

async function connectDatabase() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required for recruitment workspace E2E tests");
  }
  const database = new Client({ connectionString: databaseUrl });
  await database.connect();
  return database;
}

test.describe("recruitment workspace visibility", () => {
  let database: Client;
  let flowId = 0;

  test.beforeAll(async () => {
    database = await connectDatabase();
    /* 部门自有流程 + 本部门候选人：这是上线后最常见的形态 */
    const inserted = await database.query<{ id: number }>(
      "insert into flow (title, type, owner_id, department) values ($1, 'recruitment', $2, 'software') returning id",
      [`E2E 笔试流程 ${Date.now()}`, CANDIDATE.uid],
    );
    flowId = inserted.rows[0].id;
    await database.query(
      "insert into user_flow (progress_status, fk_flow_id, fk_user_id, apply_group, department) values ('ongoing', $1, $2, '前端组', 'software')",
      [flowId, CANDIDATE.uid],
    );
  });

  test.afterAll(async () => {
    if (flowId) await database.query("delete from flow where id = $1", [flowId]);
    await database.end();
  });

  test("笔试工作台给讲师看候选人 QQ，且不重复流程自带的投递部门", async ({
    page,
  }) => {
    await signInAs(page.context(), lecturer);
    await page.goto(`/dashboard/exams?flowId=${flowId}`);

    const row = page.getByRole("row").filter({ hasText: CANDIDATE.name });
    await expect(row).toContainText(CANDIDATE.qq);
    /* 流程归属部门已经写在流程名/页签里，行内不再重复一列投递部门 */
    await expect(page.getByTitle("投递部门")).toHaveCount(0);
  });
});
