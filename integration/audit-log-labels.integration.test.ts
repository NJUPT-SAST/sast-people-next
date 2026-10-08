/** @jest-environment node */

/**
 * 审计列表的资源标签：取消报名会物理删除 user_flow 行，列表无法再靠联表取流程名，
 * 回退到审计元数据（flowTitle 快照优先，其次按 flowId 反查流程标题），
 * 否则「取消报名」这类记录只剩资源类型 "user_flow"，没上下文可读。
 */

jest.mock("@/lib/dal", () => ({
  verifyRole: jest.fn(async () => ({
    uid: 900981,
    role: 3,
    realRole: 3,
    name: "部长",
  })),
}));

jest.mock("@/lib/authz", () => {
  const actual = jest.requireActual("@/lib/authz");
  return {
    ...actual,
    getDepartmentScope: jest.fn(async () => ({
      kind: "department",
      department: "software",
    })),
  };
});

jest.mock("@/lib/link/user-lookup", () => ({
  listPeopleUsersByLinkIds: jest.fn(async (ids: number[]) =>
    new Map(
      ids.map((id) => [
        id,
        { id, name: `用户${id}`, studentId: `B${id}`, role: 1 },
      ]),
    ),
  ),
}));

jest.mock("@/lib/link/admin", () => ({
  listLinkUsers: jest.fn(async () => ({ total: 0, users: [] })),
}));

import { db } from "@/db/drizzle";
import { flow, operationAudit, userFlow } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";
import { listOperationAudit } from "@/lib/operation-audit-list";

const ACTOR_ID = 900981;
const CANDIDATE_ID = 900982;
const TITLE_PREFIX = "SMOKEAUDIT-";

let flowId = 0;
let deletedUserFlowId = 0;
const createdAuditIds: number[] = [];

beforeAll(async () => {
  const [created] = await db
    .insert(flow)
    .values({
      title: `${TITLE_PREFIX}2026 校科协软件研发部 WOC 招新`,
      type: "woc",
      department: "software",
      ownerId: ACTOR_ID,
    })
    .returning({ id: flow.id });
  flowId = created.id;

  const [candidate] = await db
    .insert(userFlow)
    .values({
      fkFlowId: flowId,
      fkUserId: CANDIDATE_ID,
      progressStatus: "ongoing",
      department: "software",
    })
    .returning({ id: userFlow.id });
  deletedUserFlowId = candidate.id;

  /* 取消报名：留档指向已删除的 user_flow，元数据里带 flowId */
  const [lookupRow] = await db
    .insert(operationAudit)
    .values({
      actorId: CANDIDATE_ID,
      actorRole: 0,
      action: "user_flow.unregister",
      resourceType: "user_flow",
      resourceId: deletedUserFlowId,
      department: "software",
      metadata: { flowId, targetUserId: CANDIDATE_ID },
    })
    .returning({ id: operationAudit.id });

  /* 流程也被删除的历史留档：只有 flowTitle 快照可用 */
  const [snapshotRow] = await db
    .insert(operationAudit)
    .values({
      actorId: CANDIDATE_ID,
      actorRole: 0,
      action: "user_flow.unregister",
      resourceType: "user_flow",
      resourceId: deletedUserFlowId + 100000,
      department: "software",
      metadata: { flowTitle: "已删除的流程", targetUserId: CANDIDATE_ID },
    })
    .returning({ id: operationAudit.id });

  createdAuditIds.push(lookupRow.id, snapshotRow.id);

  /* 取消报名确实会删掉报名行：之后标签只能靠审计元数据 */
  await db.delete(userFlow).where(eq(userFlow.id, deletedUserFlowId));
});

afterAll(async () => {
  if (createdAuditIds.length > 0) {
    await db.delete(operationAudit).where(inArray(operationAudit.id, createdAuditIds));
  }
  if (flowId > 0) {
    await db.delete(userFlow).where(eq(userFlow.fkFlowId, flowId));
    await db.delete(flow).where(eq(flow.id, flowId));
  }
});

describe("审计列表的资源标签回退", () => {
  it("报名行已删除时用元数据里的流程名补全标签", async () => {
    const result = await listOperationAudit({
      resourceType: "user_flow",
      pageSize: 10,
    });
    const byId = new Map(result.logs.map((log) => [log.id, log]));

    const lookupRow = byId.get(createdAuditIds[0]);
    expect(lookupRow?.resourceLabel).toBe(
      `考生流程：${TITLE_PREFIX}2026 校科协软件研发部 WOC 招新（报名已取消）`,
    );
    expect(lookupRow?.targetUser?.name).toBe(`用户${CANDIDATE_ID}`);
    expect(lookupRow?.targetUser?.studentId).toBe(`B${CANDIDATE_ID}`);

    const snapshotRow = byId.get(createdAuditIds[1]);
    expect(snapshotRow?.resourceLabel).toBe(
      "考生流程：已删除的流程（报名已取消）",
    );
  });
});
