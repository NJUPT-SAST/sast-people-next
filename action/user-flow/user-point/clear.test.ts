/** @jest-environment node */

/**
 * 清分（`review.score.clear`）的服务端边界：
 * - 只有管理员（role 4）能调用，部长及以下连入口都不该有；
 * - 结果已确认 / 正在发布 / 已发布时拒绝，避免已发出的结果与分数对不上；
 * - 删除的是本题的评分记录（题目回到未批卷），原分数与阅卷人写进审计后可回溯；
 * - 部门范围外的报名记录不可清。
 */

jest.mock("server-only", () => ({}));

import type * as authzModule from "@/lib/authz";

jest.mock("@/lib/server-error-log", () => ({ logServerError: jest.fn() }));

jest.mock("@/lib/operation-audit", () => ({
  writeOperationAudit: jest.fn(async () => undefined),
}));

const mockAssertFlowResultsEditable = jest.fn(async () => undefined);

jest.mock("@/lib/flow-result-publication-guard", () => ({
  assertFlowResultsEditable: (...args: unknown[]) =>
    mockAssertFlowResultsEditable(...(args as [])),
}));

type MockSession = {
  uid: number;
  role: number;
  realRole: number;
  scope:
    | { kind: "all" }
    | { kind: "department"; department: string }
    | { kind: "none" };
};

const mockSession: MockSession = {
  uid: 9001,
  role: 4,
  realRole: 4,
  scope: { kind: "all" },
};

jest.mock("@/lib/authz", () => {
  const actual = jest.requireActual<typeof authzModule>("@/lib/authz");
  return {
    ...actual,
    verifyScopedRole: jest.fn(async (role: number) => {
      if (mockSession.role < role) {
        throw new Error("Unauthorized operation");
      }
      return mockSession;
    }),
  };
});

jest.mock("@/db/drizzle", () => {
  const st = {
    /* 按调用顺序排队的 select 返回：第一条给 user_flow，第二条给该考生已有的评分记录 */
    selectResults: [] as unknown[][],
    deleteCondition: undefined as unknown,
  };

  const chain = (resolve: () => unknown) => {
    const builder: Record<string, unknown> = {};
    for (const method of ["from", "leftJoin", "where", "orderBy", "limit", "for"]) {
      builder[method] = () => builder;
    }
    builder.then = (
      onFulfilled: (rows: unknown) => unknown,
      onRejected?: (error: unknown) => unknown,
    ) => Promise.resolve().then(resolve).then(onFulfilled, onRejected);
    return builder;
  };

  const tx = {
    select: () => ({
      from: () => {
        const rows = st.selectResults.shift() ?? [];
        return chain(() => rows);
      },
    }),
    delete: () => ({
      where: (condition: unknown) => {
        st.deleteCondition = condition;
        return chain(() => ({ rowCount: 0 }));
      },
    }),
  };

  const db = { transaction: async (callback: (t: unknown) => unknown) => callback(tx) };

  return { db, __state: st };
});

import { and, eq, inArray } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { userPoint } from "@/db/schema";
import { clearPoints } from "./clear";

type MockState = { selectResults: unknown[][]; deleteCondition: unknown };

const drizzleMock = jest.requireMock<{ __state: MockState }>("@/db/drizzle");
const mockState = drizzleMock.__state;
const writeAuditMock = jest.requireMock("@/lib/operation-audit").writeOperationAudit as jest.Mock;

const record = {
  flowId: 5,
  progressStatus: "ongoing",
  targetUserId: 4242,
  department: "software",
};

const gradedPoints = [
  { problemId: 11, points: 8, note: null, judgerId: 77, problemTitle: "第一题" },
  { problemId: 12, points: 0, note: "空题", judgerId: 78, problemTitle: "第二题" },
];

beforeEach(() => {
  mockState.selectResults = [];
  mockState.deleteCondition = undefined;
  mockSession.role = 4;
  mockSession.realRole = 4;
  mockSession.scope = { kind: "all" };
  mockAssertFlowResultsEditable.mockResolvedValue(undefined);
});

describe("clearPoints 清分边界", () => {
  it("管理员清掉指定的题：删除记录并写出可回溯的审计", async () => {
    mockState.selectResults = [[record], gradedPoints];

    const result = await clearPoints(21, [11, 12]);

    expect(result).toEqual({ success: true, clearedProblemIds: [11, 12] });

    const { params } = new PgDialect().sqlToQuery(mockState.deleteCondition as never);
    expect(params).toEqual(expect.arrayContaining([21, 11, 12]));

    expect(writeAuditMock).toHaveBeenCalledTimes(1);
    const [auditInput, auditOptions] = writeAuditMock.mock.calls[0];
    expect(auditInput).toMatchObject({
      actorId: 9001,
      action: "review.score.clear",
      resourceType: "user_flow",
      resourceId: 21,
      department: "software",
    });
    expect(auditInput.metadata).toMatchObject({
      targetUserId: 4242,
      clearedCount: 2,
      scoreChanges: [
        {
          problemId: 11,
          problemTitle: "第一题",
          previousScore: 8,
          nextScore: null,
          previousJudgerId: 77,
          nextJudgerId: null,
        },
        {
          problemId: 12,
          problemTitle: "第二题",
          previousScore: 0,
          nextScore: null,
          previousJudgerId: 78,
        },
      ],
    });
    /* 留档与删除必须同一事务 */
    expect(auditOptions).toEqual({ executor: expect.anything() });
  });

  it("不传题目 = 清空该考生全部得分", async () => {
    mockState.selectResults = [[record], gradedPoints];

    const result = await clearPoints(21);

    expect(result).toEqual({ success: true, clearedProblemIds: [11, 12] });
    const { params } = new PgDialect().sqlToQuery(mockState.deleteCondition as never);
    expect(params).toEqual(expect.arrayContaining([21, 11, 12]));
  });

  it("删除条件同时限定报名记录与题目，不会误删其他考生的分", async () => {
    mockState.selectResults = [[record], gradedPoints];

    await clearPoints(21, [11]);

    expect(mockState.deleteCondition).toEqual(
      and(eq(userPoint.fkUserFlowId, 21), inArray(userPoint.fkProblemId, [11, 12])),
    );
  });

  it("没有评分记录时不写审计", async () => {
    mockState.selectResults = [[record], []];

    const result = await clearPoints(21, [11]);

    expect(result).toEqual({ success: false, error: { message: "没有可清除的得分" } });
    expect(writeAuditMock).not.toHaveBeenCalled();
  });

  it("部长（role 3）不能清分", async () => {
    mockSession.role = 3;
    mockSession.realRole = 3;
    mockState.selectResults = [[record], gradedPoints];

    await expect(clearPoints(21, [11])).rejects.toThrow();
    expect(writeAuditMock).not.toHaveBeenCalled();
  });

  it("结果已确认（通过 / 不通过）时拒绝清分", async () => {
    mockState.selectResults = [[{ ...record, progressStatus: "passed" }], gradedPoints];

    const result = await clearPoints(21, [11]);

    expect(result).toEqual({
      success: false,
      error: { message: "该考生笔试结果已确认，不能再清分" },
    });
    expect(writeAuditMock).not.toHaveBeenCalled();
  });

  it("结果正在发布 / 已发布时回显锁定原因", async () => {
    mockAssertFlowResultsEditable.mockRejectedValue(
      new Error("该流程结果正在发布或已经发布，名单和结果已锁定"),
    );
    mockState.selectResults = [[record], gradedPoints];

    const result = await clearPoints(21, [11]);

    expect(result).toEqual({
      success: false,
      error: { message: "该流程结果正在发布或已经发布，名单和结果已锁定" },
    });
    expect(writeAuditMock).not.toHaveBeenCalled();
  });

  it("其他部门的报名记录不可清", async () => {
    mockSession.scope = { kind: "department", department: "software" };
    mockState.selectResults = [[{ ...record, department: "media" }], gradedPoints];

    const result = await clearPoints(21, [11]);

    expect(result).toEqual({
      success: false,
      error: { message: "无权操作其他部门的候选人" },
    });
    expect(writeAuditMock).not.toHaveBeenCalled();
  });

  it("报名记录不存在时返回明确原因", async () => {
    mockState.selectResults = [[]];

    const result = await clearPoints(999, [11]);

    expect(result).toEqual({ success: false, error: { message: "未找到考生流程" } });
  });

  it("题目参数非法时直接拒绝，不落库", async () => {
    const result = await clearPoints(21, [0, -3]);

    expect(result).toEqual({ success: false, error: { message: "题目无效" } });
    expect(writeAuditMock).not.toHaveBeenCalled();
  });
});
