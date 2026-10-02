/**
 * 发布后的身份同步回归：办公类的「最终去向」与「第一志愿优先」必须真正传到
 * resolveLatestPassedDepartments —— 曾经在生产调用点漏传 flowType/choice/finalDepartment，
 * 导致决议被静默忽略、归属退化成「最后发布」。
 * 这里用假的 db 走真实调用链，断言最终推送给 Link 的部门。
 */

type MockStep = { table: unknown; rows: unknown[] };
type MockState = { selectQueue: MockStep[] };

/* jest.mock 的工厂会被提升到文件顶部，但只在本文件初始化完成后才会真正查表，因此这里用 mock 前缀共享状态 */
const mockState: MockState = { selectQueue: [] };

jest.mock("@/db/drizzle", () => {
  const chainable = (rows: unknown[]) => {
    const builder: Record<string, unknown> = {
      innerJoin: () => builder,
      leftJoin: () => builder,
      where: () => builder,
      orderBy: () => builder,
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
          const step = mockState.selectQueue.shift();
          if (!step) throw new Error("测试未准备这次查询的返回数据");
          if (step.table !== table) throw new Error("查询的表与测试预期不一致");
          return chainable(step.rows);
        },
      }),
    },
  };
});

jest.mock("@/lib/authz", () => ({
  verifyManager: jest.fn(async () => ({
    uid: 1,
    role: 3,
    scope: { kind: "all" },
  })),
}));

jest.mock("@/lib/link/admin", () => ({
  updateLinkUserRoles: jest.fn(async () => ({ results: [] })),
  updateLinkUserDepartments: jest.fn(async () => ({ results: [] })),
}));

jest.mock("@/lib/link/session", () => ({
  getLinkAdminAccessTokenFromSession: jest.fn(async () => "token"),
}));

jest.mock("@/lib/link/user-lookup", () => ({
  listPeopleUsersByLinkIds: jest.fn(async () => new Map()),
}));

jest.mock("next/cache", () => ({ revalidatePath: jest.fn() }));

import { userFlow } from "@/db/schema";
import {
  updateLinkUserDepartments,
  updateLinkUserRoles,
} from "@/lib/link/admin";
import { listPeopleUsersByLinkIds } from "@/lib/link/user-lookup";
import { verifyManager } from "@/lib/authz";
import { syncUserIdentityFromAcceptedFlows } from "./roleTransition";

const updateDepartments = updateLinkUserDepartments as jest.Mock;
const updateRoles = updateLinkUserRoles as jest.Mock;
const listUsers = listPeopleUsersByLinkIds as jest.Mock;
const manager = verifyManager as jest.Mock;

const UID = 77;

const passedRow = (overrides: Record<string, unknown> = {}) => ({
  uid: UID,
  type: "office_interview",
  choice: 1,
  finalDepartment: null,
  flowDepartment: "office",
  rowDepartment: "office",
  publishedAt: new Date("2026-09-01T00:00:00Z"),
  updatedAt: new Date("2026-09-01T00:00:00Z"),
  ...overrides,
});

beforeEach(() => {
  mockState.selectQueue = [];
  listUsers.mockResolvedValue(
    new Map([[UID, { name: "张三", role: 0, studentId: "1", departments: [] }]]),
  );
  updateDepartments.mockResolvedValue({ results: [{ id: UID, success: true }] });
  updateRoles.mockResolvedValue({ results: [{ id: UID, success: true }] });
  manager.mockResolvedValue({ uid: 1, role: 3, scope: { kind: "all" } });
});

const departmentsSent = () =>
  updateDepartments.mock.calls.map((call) => call[2]);

describe("office department resolution reaches the Link sync", () => {
  it("assigns the first-choice office department even when the second choice was published later", async () => {
    mockState.selectQueue.push({
      table: userFlow,
      rows: [
        passedRow({
          choice: 1,
          flowDepartment: "office",
          rowDepartment: "office",
          publishedAt: new Date("2026-09-01T00:00:00Z"),
        }),
        passedRow({
          choice: 2,
          flowDepartment: "publicity",
          rowDepartment: "publicity",
          publishedAt: new Date("2026-09-10T00:00:00Z"),
        }),
      ],
    });

    await syncUserIdentityFromAcceptedFlows([UID], 7);

    expect(departmentsSent()).toEqual(["office"]);
  });

  it("honours the committee's final destination over the first choice", async () => {
    mockState.selectQueue.push({
      table: userFlow,
      rows: [
        passedRow({
          choice: 1,
          flowDepartment: "office",
          rowDepartment: "office",
          finalDepartment: "liaison",
        }),
        passedRow({
          choice: 2,
          flowDepartment: "publicity",
          rowDepartment: "publicity",
          publishedAt: new Date("2026-09-10T00:00:00Z"),
        }),
        /* 评议把最终去向定在第三志愿：该部门也必须确实已通过，评议值才生效 */
        passedRow({
          choice: 2,
          flowDepartment: "liaison",
          rowDepartment: "liaison",
          publishedAt: new Date("2026-09-12T00:00:00Z"),
        }),
      ],
    });

    await syncUserIdentityFromAcceptedFlows([UID], 7);

    expect(departmentsSent()).toEqual(["liaison"]);
  });

  it("ignores a final destination the candidate did not pass", async () => {
    mockState.selectQueue.push({
      table: userFlow,
      rows: [
        passedRow({
          choice: 1,
          flowDepartment: "office",
          rowDepartment: "office",
          /* 评议预设到未通过的部门（落选后才写入/落选后仍未清除）：不能把成员归过去 */
          finalDepartment: "liaison",
        }),
        passedRow({
          choice: 2,
          flowDepartment: "publicity",
          rowDepartment: "publicity",
          publishedAt: new Date("2026-09-10T00:00:00Z"),
        }),
      ],
    });

    await syncUserIdentityFromAcceptedFlows([UID], 7);

    expect(departmentsSent()).toEqual(["office"]);
  });

  it("keeps a tech flow registration on its own department", async () => {
    mockState.selectQueue.push({
      table: userFlow,
      rows: [
        passedRow({
          type: "recruitment",
          choice: null,
          flowDepartment: "software",
          rowDepartment: "software",
        }),
      ],
    });

    await syncUserIdentityFromAcceptedFlows([UID], 7);

    expect(departmentsSent()).toEqual(["software"]);
  });
});