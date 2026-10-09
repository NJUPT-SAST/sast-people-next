/** @jest-environment node */

/**
 * 取消报名的服务端准入边界。
 *
 * 数据模型：提交报名时 `register` 把当前步骤写成「报名」（order=1）的下一步（order=2），
 * 所以「刚报名、还没被处理」的持久状态是前两步之一——这两步都允许取消；
 * 推进到第三步（某个后续步骤已结束）就拒绝，直接连旧页面 / 直连请求也挡住。
 */

jest.mock("@/db/drizzle", () => {
  const st = {
    /* 按调用顺序排队的 select 返回：第一条给 user_flow，第二条给 flow_step 前两步 */
    selectResults: [] as unknown[][],
    deleteRowCount: 0,
    deleteCondition: undefined as unknown,
  };

  const chain = (resolve: () => unknown) => {
    const builder: Record<string, unknown> = {};
    for (const method of ["from", "where", "orderBy", "limit"]) {
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
        return chain(() => ({ rowCount: st.deleteRowCount }));
      },
    }),
  };

  const db = { transaction: async (callback: (t: unknown) => unknown) => callback(tx) };

  return { db, __state: st };
});

jest.mock("@/lib/dal", () => ({
  verifySession: jest.fn(async () => ({ uid: 77, realRole: 0 })),
}));
jest.mock("next/cache", () => ({ revalidatePath: jest.fn() }));
jest.mock("@/lib/server-error-log", () => ({ logServerError: jest.fn() }));
jest.mock("@/lib/operation-audit", () => ({ writeOperationAudit: jest.fn() }));
jest.mock("@/lib/flow-result-publication-guard", () => ({
  assertFlowResultsEditable: jest.fn(async () => undefined),
}));

import { and, eq, inArray, isNull, or } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { userFlow } from "@/db/schema";
import { unregister } from "./unregister";

type MockState = {
  selectResults: unknown[][];
  deleteRowCount: number;
  deleteCondition: unknown;
};

const drizzleMock = jest.requireMock<{ __state: MockState }>("@/db/drizzle");
const mockState = drizzleMock.__state;

const record = {
  id: 21,
  fkUserId: 77,
  flowId: 5,
  department: "software",
};

beforeEach(() => {
  mockState.selectResults = [];
  mockState.deleteRowCount = 0;
  mockState.deleteCondition = undefined;
});

describe("unregister 准入边界", () => {
  it("刚报名（当前步骤=报名后的第一步/第二步）时允许取消", async () => {
    mockState.selectResults = [[record], [{ id: 101 }, { id: 102 }]];
    mockState.deleteRowCount = 1;

    const result = await unregister(21);

    expect(result).toEqual({ success: true });
    /* 删除条件必须同时放开前两步（101/102）以及未记录当前步骤的行 */
    const { params } = new PgDialect().sqlToQuery(
      mockState.deleteCondition as never,
    );
    expect(params).toEqual(expect.arrayContaining([21, 101, 102]));
  });

  it("三条删除条件与「前两步 + 未记录步骤」一致（防边界被改窄）", async () => {
    mockState.selectResults = [[record], [{ id: 101 }, { id: 102 }]];
    mockState.deleteRowCount = 1;

    await unregister(21);

    const expected = and(
      eq(userFlow.id, 21),
      or(
        isNull(userFlow.fkCurrentStepId),
        inArray(userFlow.fkCurrentStepId, [101, 102]),
      ),
    );
    expect(mockState.deleteCondition).toEqual(expected);
  });

  it("流程已推进（当前步骤不在前两步，删除 0 行）时拒绝取消", async () => {
    mockState.selectResults = [[record], [{ id: 101 }, { id: 102 }]];
    mockState.deleteRowCount = 0;

    const result = await unregister(21);

    expect(result).toEqual({
      success: false,
      error: { message: "流程已推进，无法取消报名" },
    });
  });

  it("删除的是别人的报名时返回无权操作", async () => {
    mockState.selectResults = [[{ ...record, fkUserId: 999 }]];

    const result = await unregister(21);

    expect(result).toEqual({ success: false, error: { message: "无权操作" } });
  });
});
