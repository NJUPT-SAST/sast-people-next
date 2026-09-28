import { Client } from "pg";

jest.mock("server-only", () => ({}));
jest.mock("next/cache", () => ({ revalidatePath: jest.fn() }));
jest.mock("@/lib/authz", () => ({
  verifyAdmin: jest.fn(),
}));
jest.mock("@/lib/operation-audit", () => ({ writeOperationAudit: jest.fn() }));
jest.mock("@/lib/link/user-lookup", () => ({
  getPeopleUserByLinkId: jest.fn(),
  listPeopleUsersByLinkIds: jest.fn(),
}));

import {
  assignFlowDepartment,
  assignUserFlowDepartment,
  listDepartmentOverview,
  listFlowDepartmentAssignments,
  listUserFlowDepartmentAssignments,
} from "@/action/department/manage";
import { writeOperationAudit } from "@/lib/operation-audit";
import { getPeopleUserByLinkId, listPeopleUsersByLinkIds } from "@/lib/link/user-lookup";
import { verifyAdmin } from "@/lib/authz";
import { db } from "@/db/drizzle";

const ADMIN_UID = 901_001;

const requireLocalTestDatabase = (value: string | undefined) => {
  if (!value) throw new Error("DATABASE_URL is required for PostgreSQL integration tests");

  const url = new URL(value);
  const databaseName = url.pathname.replace(/^\//, "");
  const isLocalHost = ["127.0.0.1", "::1", "localhost"].includes(url.hostname);
  if (!isLocalHost || !(databaseName.endsWith("_local") || databaseName.endsWith("_test"))) {
    throw new Error(
      "PostgreSQL integration tests require a local database ending in _local or _test",
    );
  }

  return value;
};

const client = new Client({
  connectionString: requireLocalTestDatabase(process.env.DATABASE_URL),
});

describe("部门控制台（服务端动作）", () => {
  let flowId: number;
  let userFlowIds: number[];

  beforeAll(async () => {
    await client.connect();
  });

  afterAll(async () => {
    if (flowId) await client.query("delete from flow where id = $1", [flowId]);
    await client.end();
    /* 关闭服务端动作用到连接池，避免 Jest 退出时残留句柄 */
    await db.$client.end();
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    (verifyAdmin as jest.Mock).mockResolvedValue({
      uid: ADMIN_UID,
      role: 4,
      name: "管理员",
    });
    (getPeopleUserByLinkId as jest.Mock).mockImplementation(async (id: number) => ({
      id,
      name: `用户${id}`,
      studentId: `S${id}`,
    }));
    (listPeopleUsersByLinkIds as jest.Mock).mockImplementation(async (ids: number[]) =>
      new Map(ids.map((id) => [id, { id, name: `用户${id}`, studentId: `S${id}` }])),
    );

    const flow = await client.query<{ id: number }>(
      `insert into flow (title, type, owner_id) values ($1, 'recruitment', $2) returning id`,
      [`Department integration flow ${crypto.randomUUID()}`, ADMIN_UID],
    );
    flowId = flow.rows[0].id;
    const userFlows = await client.query<{ id: number }>(
      `insert into user_flow (progress_status, fk_flow_id, fk_user_id, apply_group)
       select 'ongoing', $1, $2 + generate_series, '前端组' from generate_series(1, 2)
       returning id`,
      [flowId, 910_000],
    );
    userFlowIds = userFlows.rows.map((row) => row.id);
  });

  afterEach(async () => {
    await client.query("delete from flow where id = $1", [flowId]);
  });

  it("把流程归到部门后可清空为全局，并在概览里反映未归属数量", async () => {
    await assignFlowDepartment(flowId, " software ");
    const [assigned] = (
      await client.query<{ department: string | null }>(
        "select department from flow where id = $1",
        [flowId],
      )
    ).rows;
    expect(assigned.department).toBe("software");

    const assignedOverview = await listDepartmentOverview();
    const software = assignedOverview.departments.find((row) => row.department === "software");
    expect(software?.flowCount).toBeGreaterThanOrEqual(1);
    expect(assignedOverview.departmentKeys).toContain("software");

    await assignFlowDepartment(flowId, null);
    const [cleared] = (
      await client.query<{ department: string | null }>(
        "select department from flow where id = $1",
        [flowId],
      )
    ).rows;
    expect(cleared.department).toBeNull();

    const clearedOverview = await listDepartmentOverview();
    expect(clearedOverview.unassignedFlowCount).toBeGreaterThanOrEqual(1);
    expect(
      clearedOverview.departments.find((row) => row.department === "software")?.flowCount ?? 0,
    ).toBeLessThan(software?.flowCount ?? 0);
  });

  it("报名记录归属可赋可清，未归属筛选与总数一致", async () => {
    const target = userFlowIds[0];
    await assignUserFlowDepartment(target, "media");
    const [assigned] = (
      await client.query<{ department: string | null }>(
        "select department from user_flow where id = $1",
        [target],
      )
    ).rows;
    expect(assigned.department).toBe("media");

    const unassigned = await listUserFlowDepartmentAssignments({
      flowId,
      onlyUnassigned: true,
      limit: 10,
    });
    expect(unassigned.total).toBe(1);
    expect(unassigned.items.map((item) => item.id)).toEqual([userFlowIds[1]]);
    expect(unassigned.items[0].flowTitle).toContain("Department integration flow");
    expect(unassigned.items[0].userName).toBe(`用户${910_002}`);

    const all = await listUserFlowDepartmentAssignments({ flowId, limit: 10 });
    expect(all.total).toBe(2);
    expect(all.items.find((item) => item.id === target)?.department).toBe("media");

    await assignUserFlowDepartment(target, null);
    expect(
      (
        await client.query<{ department: string | null }>(
          "select department from user_flow where id = $1",
          [target],
        )
      ).rows[0].department,
    ).toBeNull();
  });

  it("流程归属分配表带候选人数量与组别映射", async () => {
    await client.query("update flow set group_departments = $2::jsonb where id = $1", [
      flowId,
      JSON.stringify({ 前端组: "software" }),
    ]);

    const rows = await listFlowDepartmentAssignments();
    const row = rows.find((item) => item.id === flowId);
    expect(row?.candidateCount).toBe(2);
    expect(row?.groupDepartments).toEqual({ 前端组: "software" });
    // 组别映射里的部门标识也应出现在现存部门清单里
    expect((await listDepartmentOverview()).departmentKeys).toContain("software");
  });

  it("拒绝非法部门标识与不存在的记录", async () => {
    await expect(assignFlowDepartment(flowId, "   ")).rejects.toThrow("部门标识不合法");
    await expect(assignFlowDepartment(flowId, "x".repeat(65))).rejects.toThrow("部门标识不合法");
    await expect(assignFlowDepartment(0, "software")).rejects.toThrow();
    await expect(assignFlowDepartment(999_999_999, "software")).rejects.toThrow("流程不存在");
    await expect(assignUserFlowDepartment(999_999_999, "software")).rejects.toThrow(
      "报名记录不存在",
    );
    expect(writeOperationAudit).not.toHaveBeenCalled();
  });

});
