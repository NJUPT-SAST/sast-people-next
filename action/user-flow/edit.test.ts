/** @jest-environment node */

/**
 * 终态写入的步骤落点。
 *
 * 卡片把「当前步骤」和步骤圆点画在同一行（`components/userFlow/flowCard.tsx`），所以终态
 * （passed / failed）必须落在流程的最后一步：笔试流程的判定结果是在「批卷」页录入的，
 * 写回候选人当时所在的「批卷」步就会出现「已通过考核 / 当前步骤：批卷 / 第三步已通过」这种
 * 自相矛盾的展示。这里钉住三条写入路径（批量设置结果、管理员手动通过 / 不通过）都写最后一步，
 * 以及未参与（withdrawn）不动当前步骤。
 */

type MockSelect = { table: unknown; rows: unknown[] };

const mockSelects: MockSelect[] = [];
const mockUpdates: Array<{ table: unknown; values: Record<string, unknown> }> = [];
const mockAudits: Array<Record<string, unknown>> = [];

jest.mock("@/db/drizzle", () => {
  const chainable = (rows: unknown[]) => {
    const builder: Record<string, unknown> = {};
    for (const method of ["from", "innerJoin", "where", "orderBy", "limit", "for"]) {
      builder[method] = () => builder;
    }
    builder.then = (
      onFulfilled: (rows: unknown[]) => unknown,
      onRejected?: (error: unknown) => unknown,
    ) => Promise.resolve(rows).then(onFulfilled, onRejected);
    return builder;
  };

  const db: Record<string, unknown> = {
    select: () => ({
      from: (table: unknown) => {
        const step = mockSelects.shift();
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
      };
      return builder;
    },
  };
  db.transaction = (callback: (tx: unknown) => Promise<unknown>) => callback(db);

  return { db };
});

jest.mock("@/lib/authz", () => ({
  verifyManager: jest.fn(async () => ({
    uid: 1,
    role: 4,
    realRole: 4,
    scope: { kind: "all" },
  })),
}));

jest.mock("@/lib/flow-access", () => ({
  assertFlowEditable: jest.fn(),
  assertUserFlowInScope: jest.fn(),
}));

jest.mock("@/lib/flow-result-publication-guard", () => ({
  assertFlowResultsEditable: jest.fn(async () => undefined),
}));

jest.mock("@/lib/operation-audit", () => ({
  writeOperationAudit: jest.fn(async (entry: Record<string, unknown>) => {
    mockAudits.push(entry);
  }),
}));

jest.mock("@/lib/server-error-log", () => ({ logServerError: jest.fn() }));
jest.mock("next/cache", () => ({ revalidatePath: jest.fn() }));

import { flow, flowStep, userFlow } from "@/db/schema";
import { batchSetOutcomeByUid, finish, reject } from "./edit";

const FINAL_STEP_ID = 1013;

beforeEach(() => {
  mockSelects.length = 0;
  mockUpdates.length = 0;
  mockAudits.length = 0;
});

describe("batchSetOutcomeByUid 的步骤落点", () => {
  it("设为通过 / 不通过时把当前步骤写到流程最后一步，审计仍记录判定录入在哪一步", async () => {
    mockSelects.push(
      // assertFlowInScope
      { table: flow, rows: [{ department: "software" }] },
      // assertBatchDirectOutcomeAllowed
      { table: flow, rows: [{ type: "recruitment" }] },
      // findFinalStepId：流程的 finished 步骤
      { table: flowStep, rows: [{ id: FINAL_STEP_ID }] },
      // 事务内锁定待更新的报名记录
      { table: userFlow, rows: [{ id: 201, userId: 4 }] },
    );

    await expect(
      batchSetOutcomeByUid(101, 2, "passed", [4]),
    ).resolves.toEqual({ updatedUserIds: [4] });

    expect(mockUpdates).toEqual([
      {
        table: userFlow,
        values: expect.objectContaining({
          progressStatus: "passed",
          fkCurrentStepId: FINAL_STEP_ID,
        }),
      },
    ]);
    expect(mockAudits[0]).toMatchObject({
      action: "user_flow.batch_set_outcome",
      metadata: { stepOrder: 2, status: "passed", updatedUserIds: [4] },
    });
  });

  it("流程没有 finished 步骤时退回到 order 最大的一步", async () => {
    mockSelects.push(
      { table: flow, rows: [{ department: "software" }] },
      { table: flow, rows: [{ type: "recruitment" }] },
      { table: flowStep, rows: [] },
      { table: flowStep, rows: [{ id: 77 }] },
      { table: userFlow, rows: [{ id: 201, userId: 4 }] },
    );

    await batchSetOutcomeByUid(101, 2, "failed", [4]);

    expect(mockUpdates[0].values).toMatchObject({
      progressStatus: "failed",
      fkCurrentStepId: 77,
    });
  });

  it("标记未参与时不动当前步骤（候选人停在离开的那一步）", async () => {
    mockSelects.push(
      { table: flow, rows: [{ department: "software" }] },
      { table: flow, rows: [{ type: "recruitment" }] },
      { table: userFlow, rows: [{ id: 201, userId: 4 }] },
    );

    await batchSetOutcomeByUid(101, 2, "withdrawn", [4]);

    expect(mockUpdates[0].values).toEqual({
      progressStatus: "withdrawn",
      updatedAt: expect.any(Date),
    });
  });
});

describe("管理员手动调整结果时的步骤落点", () => {
  it("手动通过把当前步骤写到流程最后一步", async () => {
    mockSelects.push(
      // flowRecord
      { table: userFlow, rows: [{ flowId: 101, department: "software" }] },
      // assertUserFlowCanBeManuallyAdjusted
      { table: userFlow, rows: [{ progressStatus: "ongoing" }] },
      // assertDirectOutcomeAllowed
      { table: userFlow, rows: [{ flowType: "recruitment" }] },
      // 审计用的 fkUserId
      { table: userFlow, rows: [{ userFlowId: 201, fkUserId: 4 }] },
      // findFinalStepId
      { table: flowStep, rows: [{ id: FINAL_STEP_ID }] },
    );

    await finish(201);

    expect(mockUpdates[0].values).toMatchObject({
      progressStatus: "passed",
      fkCurrentStepId: FINAL_STEP_ID,
    });
  });

  it("手动不通过同样把当前步骤写到流程最后一步", async () => {
    mockSelects.push(
      { table: userFlow, rows: [{ flowId: 101, department: "software" }] },
      { table: userFlow, rows: [{ progressStatus: "ongoing" }] },
      { table: userFlow, rows: [{ flowType: "recruitment" }] },
      { table: userFlow, rows: [{ fkUserId: 4 }] },
      { table: flowStep, rows: [{ id: FINAL_STEP_ID }] },
    );

    await reject(201);

    expect(mockUpdates[0].values).toMatchObject({
      progressStatus: "failed",
      fkCurrentStepId: FINAL_STEP_ID,
    });
  });
});
