/**
 * 流程类型/归属变更的护栏：只有管理员可改，且已有报名记录时不得改类型或改归属部门
 * （语义类型里多个组合 type 相同、仅部门不同，直接改归属会让老候选人在两边都看不见）。
 */

type MockStep = { table: unknown; rows: unknown[] };

const mockState: MockStep[] = [];

jest.mock("@/db/drizzle", () => {
  const chainable = (rows: unknown[]) => {
    const builder: Record<string, unknown> = {
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
    },
  };
});

import { userFlow } from "@/db/schema";
import type { DepartmentScope } from "@/lib/authz";
import { resolveFlowTypeChange } from "./type-change";

const admin: DepartmentScope = { kind: "all" };
const manager: DepartmentScope = { kind: "department", department: "office" };

const withRegistrations = (exists: boolean) => {
  mockState.push({ table: userFlow, rows: exists ? [{ id: 1 }] : [] });
};

beforeEach(() => {
  mockState.length = 0;
});

describe("resolveFlowTypeChange", () => {
  it("keeps the type and returns nothing when neither type nor department changed", async () => {
    await expect(
      resolveFlowTypeChange({
        flowId: 1,
        scope: admin,
        currentType: "office_interview",
        currentDepartment: "office",
        nextType: "office_interview",
        nextDepartment: "office",
      }),
    ).resolves.toBeNull();
    expect(mockState).toHaveLength(0);
  });

  it("rejects a type change for non-admins", async () => {
    await expect(
      resolveFlowTypeChange({
        flowId: 1,
        scope: manager,
        currentType: "office_interview",
        currentDepartment: "office",
        nextType: "recruitment",
        nextDepartment: null,
      }),
    ).rejects.toThrow("只有管理员可以修改流程类型");
  });

  it("rejects a department move even when the type is unchanged (semantic combos share a type)", async () => {
    await expect(
      resolveFlowTypeChange({
        flowId: 1,
        scope: manager,
        currentType: "office_interview",
        currentDepartment: "office",
        nextType: "office_interview",
        nextDepartment: "publicity",
      }),
    ).rejects.toThrow("只有管理员可以修改流程归属部门");
  });

  it("rejects changing the type of a flow that already has registrations", async () => {
    withRegistrations(true);
    await expect(
      resolveFlowTypeChange({
        flowId: 1,
        scope: admin,
        currentType: "office_interview",
        currentDepartment: "office",
        nextType: "recruitment",
        nextDepartment: null,
      }),
    ).rejects.toThrow("已有报名记录的流程不能修改类型");
  });

  it("rejects moving the department of a flow that already has registrations", async () => {
    withRegistrations(true);
    await expect(
      resolveFlowTypeChange({
        flowId: 1,
        scope: admin,
        currentType: "office_interview",
        currentDepartment: "office",
        nextType: "office_interview",
        nextDepartment: "publicity",
      }),
    ).rejects.toThrow("已有报名记录的流程不能修改归属部门");
  });

  it("lets an admin retype an empty flow and requires a department for office flows", async () => {
    withRegistrations(false);
    await expect(
      resolveFlowTypeChange({
        flowId: 1,
        scope: admin,
        currentType: "recruitment",
        currentDepartment: "software",
        nextType: "soc",
        nextDepartment: "software",
      }),
    ).resolves.toEqual({ type: "soc" });

    await expect(
      resolveFlowTypeChange({
        flowId: 1,
        scope: admin,
        currentType: "recruitment",
        currentDepartment: "software",
        nextType: "office_interview",
        nextDepartment: null,
      }),
    ).rejects.toThrow("办公类部门面试招新必须归属一个办公部门");
  });
});