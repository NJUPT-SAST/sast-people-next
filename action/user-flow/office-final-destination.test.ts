/**
 * 办公类最终去向写入护栏 + Link 同步失败的语义：
 * - 只能指向仍在进行或已通过的志愿部门；
 * - 决定写库后立即同步 Link 身份，同步失败不能让「已保存」变成报错（退回 syncWarning）。
 */

type MockStep = { table: unknown; rows: unknown[] };

const mockState: MockStep[] = [];
const mockUpdates: unknown[] = [];

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

  return {
    db: {
      select: () => ({
        from: (table: unknown) => {
          const step = mockState.shift();
          if (!step) throw new Error("测试未准备这次查询的返回数据");
          if (step.table !== table) throw new Error("查询的表与测试预期不一致");
          return chainable(step.rows);
        },
      }),
      update: () => {
        const builder: Record<string, unknown> = {
          set: (values: unknown) => {
            mockUpdates.push(values);
            return builder;
          },
          where: () => builder,
          then: (onFulfilled: (value: unknown) => unknown) =>
            Promise.resolve().then(onFulfilled),
        };
        return builder;
      },
    },
  };
});

jest.mock("@/lib/authz", () => ({
  verifyManager: jest.fn(async () => ({
    uid: 1,
    role: 3,
    realRole: 3,
    scope: { kind: "department", department: "publicity" },
  })),
}));

jest.mock("@/lib/flow-access", () => ({
  assertFlowEditableRecord: jest.fn(),
}));

jest.mock("@/lib/operation-audit", () => ({
  writeOperationAudit: jest.fn(async () => undefined),
}));

const mockSyncIdentity = jest.fn();
jest.mock("@/action/user-flow/roleTransition", () => ({
  syncUserIdentityFromAcceptedFlows: (...args: unknown[]) =>
    mockSyncIdentity(...args),
}));

jest.mock("next/cache", () => ({ revalidatePath: jest.fn() }));
jest.mock("@/lib/server-error-log", () => ({ logServerError: jest.fn() }));

import { userFlow } from "@/db/schema";
import { setOfficeFinalDestination } from "./office-final-destination";

const recordRow = {
  userFlowId: 11,
  uid: 77,
  flowType: "office_interview",
  flowDepartment: "publicity",
};

const registrationRow = (
  overrides: Partial<Record<string, unknown>> = {},
): Record<string, unknown> => ({
  id: 11,
  choice: 1,
  progressStatus: "ongoing",
  rowDepartment: "publicity",
  flowDepartment: "publicity",
  ...overrides,
});

beforeEach(() => {
  mockState.length = 0;
  mockUpdates.length = 0;
  mockSyncIdentity.mockReset();
  mockSyncIdentity.mockResolvedValue(undefined);
});

describe("setOfficeFinalDestination", () => {
  it("rejects a volunteer department the candidate failed or withdrew", async () => {
    mockState.push({ table: userFlow, rows: [recordRow] });
    mockState.push({
      table: userFlow,
      rows: [
        registrationRow(),
        registrationRow({
          id: 12,
          choice: 2,
          progressStatus: "failed",
          rowDepartment: "office",
          flowDepartment: "office",
        }),
      ],
    });

    await expect(setOfficeFinalDestination(11, "office")).resolves.toEqual({
      success: false,
      error: { message: "最终去向必须是该候选人仍在进行或已通过的志愿部门" },
    });
    expect(mockUpdates).toHaveLength(0);
    expect(mockSyncIdentity).not.toHaveBeenCalled();
  });

  it("saves the destination and reports a warning when the Link sync fails", async () => {
    mockState.push({ table: userFlow, rows: [recordRow] });
    mockState.push({ table: userFlow, rows: [registrationRow()] });
    mockSyncIdentity.mockRejectedValue(new Error("Link 不可用"));

    const result = await setOfficeFinalDestination(11, "publicity");

    expect(result).toEqual({
      success: true,
      department: "publicity",
      syncWarning:
        "最终去向已保存，但成员部门同步失败，请稍后在成员管理或发布流程时重试",
    });
    /* 决定已经写库，不能因为同步失败回滚或报错 */
    expect(mockUpdates).toEqual([
      expect.objectContaining({
        finalDepartment: "publicity",
        finalDepartmentDecidedAt: expect.any(Date),
      }),
    ]);
    expect(mockSyncIdentity).toHaveBeenCalledWith([77]);
  });

  it("clears the destination without a warning when everything succeeds", async () => {
    mockState.push({ table: userFlow, rows: [recordRow] });
    mockState.push({ table: userFlow, rows: [registrationRow()] });

    const result = await setOfficeFinalDestination(11, null);

    expect(result).toEqual({ success: true, department: null });
    expect(mockUpdates).toEqual([
      expect.objectContaining({
        finalDepartment: null,
        finalDepartmentDecidedAt: null,
      }),
    ]);
  });

  it("rejects flows that are not office interviews before touching the database", async () => {
    mockState.push({
      table: userFlow,
      rows: [{ ...recordRow, flowType: "recruitment" }],
    });

    await expect(setOfficeFinalDestination(11, "publicity")).resolves.toEqual({
      success: false,
      error: { message: "只有办公类部门面试需要设置最终去向" },
    });
    expect(mockUpdates).toHaveLength(0);
  });
});
