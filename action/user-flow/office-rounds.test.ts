/**
 * 一面名单确认的收口语义：名单写入与「报名截止」在同一条事务里落库——
 * 确认一面之后该流程不再接受新报名（报名入口置灰、register 服务端同样拒绝），
 * 晚来的报名已经没有一面可以参加。
 */

type MockStep = { table: unknown; rows: unknown[] };

const mockState: MockStep[] = [];
const mockUpdates: Array<{ table: unknown; values: Record<string, unknown> }> = [];
const mockUpdateReturning: unknown[][] = [];

jest.mock("@/db/drizzle", () => {
  const chainable = (rows: unknown[]) => {
    const builder: Record<string, unknown> = {
      innerJoin: () => builder,
      where: () => builder,
      limit: () => builder,
      then: (
        onFulfilled: (rows: unknown[]) => unknown,
        onRejected?: (error: unknown) => unknown,
      ) => Promise.resolve(rows).then(onFulfilled, onRejected),
    };
    return builder;
  };

  const db = {
    select: () => ({
      from: (table: unknown) => {
        const step = mockState.shift();
        if (!step) throw new Error("测试未准备这次查询的返回数据");
        if (step.table !== table) throw new Error("查询的表与测试预期不一致");
        return chainable(step.rows);
      },
    }),
    update: (table: unknown) => {
      const builder: Record<string, unknown> = {
        set: (values: Record<string, unknown>) => {
          mockUpdates.push({ table, values });
          return builder;
        },
        where: () => builder,
        returning: () => Promise.resolve(mockUpdateReturning.shift() ?? []),
        then: (
          onFulfilled: (value: unknown) => unknown,
          onRejected?: (error: unknown) => unknown,
        ) => Promise.resolve(undefined).then(onFulfilled, onRejected),
      };
      return builder;
    },
    execute: jest.fn(async () => undefined),
    transaction: (callback: (tx: unknown) => Promise<unknown>) => callback(db),
  };

  return { db };
});

jest.mock("@/lib/authz", () => ({
  verifyManager: jest.fn(async () => ({
    uid: 1,
    role: 3,
    realRole: 3,
    scope: { kind: "department", department: "office" },
  })),
}));

jest.mock("@/lib/flow-access", () => ({
  assertFlowEditableRecord: jest.fn(),
}));

jest.mock("@/lib/flow-result-publication-guard", () => ({
  assertFlowResultsEditable: jest.fn(async () => undefined),
}));

jest.mock("@/lib/operation-audit", () => ({
  writeOperationAudit: jest.fn(async () => undefined),
}));

jest.mock("@/lib/server-error-log", () => ({ logServerError: jest.fn() }));
jest.mock("next/cache", () => ({ revalidatePath: jest.fn() }));

const mockCreateOfficeRoundOneEmailBatch = jest.fn();
jest.mock("@/lib/email-center/batch", () => ({
  createOfficeRoundOneEmailBatch: (...args: unknown[]) =>
    mockCreateOfficeRoundOneEmailBatch(...args),
}));

jest.mock("@/action/flow/result-publication", () => ({
  publishFlowResults: jest.fn(async () => ({ counts: { total: 0 } })),
}));

import { flow, flowStep, interviewEvaluation, userFlow } from "@/db/schema";
import { closeOfficeRoundOne } from "./office-rounds";

describe("closeOfficeRoundOne", () => {
  beforeEach(() => {
    mockState.length = 0;
    mockUpdates.length = 0;
    mockUpdateReturning.length = 0;
    mockCreateOfficeRoundOneEmailBatch.mockReset();
    mockCreateOfficeRoundOneEmailBatch.mockResolvedValue({ recipientCount: 1 });
  });

  it("writes the round-one roster and closes registrations in the same transaction", async () => {
    mockState.push(
      {
        table: flow,
        rows: [
          {
            id: 11,
            title: "2026 办公室面试招新",
            type: "office_interview",
            department: "office",
            isDeleted: false,
          },
        ],
      },
      // validateRoundDecisions：仍在进行的一面候选人
      { table: userFlow, rows: [{ id: 101 }] },
      // apply：二面 / 结果步骤
      { table: flowStep, rows: [{ id: 33 }] },
      { table: flowStep, rows: [{ id: 44 }] },
      // buildDecisionSnapshot：确认时刻的面评分数
      { table: interviewEvaluation, rows: [] },
    );
    mockUpdateReturning.push([{ id: 101 }]);

    await expect(
      closeOfficeRoundOne(11, [{ userFlowId: 101, passed: true }], true),
    ).resolves.toEqual({
      success: true,
      passCount: 1,
      rejectCount: 0,
      sent: 2,
    });

    /* 名单写入（候选人进入二面）与报名截止同步落库 */
    expect(mockUpdates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          table: userFlow,
          values: expect.objectContaining({
            progressStatus: "ongoing",
            round: 2,
          }),
        }),
        {
          table: flow,
          values: expect.objectContaining({
            registrationClosedAt: expect.any(Date),
          }),
        },
      ]),
    );
  });
});
