/** @jest-environment node */

/**
 * 阅卷入口的部门隔离：
 * - calScore（阅卷成绩列表）只返回本部门可见流程的题目与考生，其他部门/未归属流程不返回任何数据；
 * - findUserFlowId（阅卷扫码/手输入口）要求讲师及以上，且候选人报名归属在当前部门 scope 内。
 */

jest.mock("@/lib/server-error-log", () => ({
  logServerError: jest.fn(),
}));

jest.mock("@/lib/link/user-lookup", () => ({
  listPeopleUsersByLinkIds: jest.fn(async () => new Map()),
  findPeopleUserByStudentId: jest.fn(),
}));

type MockSession = {
  uid: number;
  role: number;
  name: string;
  department: string | null;
  scope:
    | { kind: "all" }
    | { kind: "department"; department: string }
    | { kind: "none" };
};

/* 本体 mock 会话属于科宣部（publicity）；测试内按需调整角色 */
const mockSession: MockSession = {
  uid: 900981,
  role: 2,
  name: "阅卷讲师",
  department: "publicity",
  scope: { kind: "department", department: "publicity" },
};

jest.mock("@/lib/authz", () => {
  const actual = jest.requireActual<typeof import("@/lib/authz")>("@/lib/authz");
  return {
    ...actual,
    verifyScopedRole: jest.fn(async (role: number) => {
      if (mockSession.role < role) {
        throw new Error("Unauthorized operation");
      }
      if (mockSession.scope.kind === "none") {
        throw new Error("当前账号未归属任何部门，请联系管理员分配部门。");
      }
      return mockSession;
    }),
    verifyManager: jest.fn(async () => mockSession),
  };
});

import { db } from "@/db/drizzle";
import { flow, flowStep, problem, userFlow } from "@/db/schema";
import { calScore } from "@/action/user-flow/user-point/calScore";
import { findUserFlowId } from "@/action/user-flow/find";
import { findPeopleUserByStudentId } from "@/lib/link/user-lookup";
import { inArray } from "drizzle-orm";

const CANDIDATE_ID = 900982;
const OTHER_DEPARTMENT_CANDIDATE_ID = 900983;

const createdFlowIds: number[] = [];
const createdUserFlowIds: number[] = [];

const createFlowWithProblem = async (department: string, title: string) => {
  const [flowRow] = await db
    .insert(flow)
    .values({
      title,
      type: "recruitment",
      department,
      ownerId: mockSession.uid,
    })
    .returning({ id: flow.id });

  const [step] = await db
    .insert(flowStep)
    .values({
      title: "笔试",
      type: "checking",
      order: 2,
      fkFlowId: flowRow.id,
    })
    .returning({ id: flowStep.id });

  await db.insert(problem).values({
    title: `${title} 题目`,
    score: 100,
    fkFlowStepId: step.id,
  });

  createdFlowIds.push(flowRow.id);
  return { flowId: flowRow.id, stepId: step.id };
};

const createCandidate = async (
  userId: number,
  targetFlowId: number,
  department: string,
  stepId: number | null,
) => {
  const [row] = await db
    .insert(userFlow)
    .values({
      fkFlowId: targetFlowId,
      fkUserId: userId,
      progressStatus: "ongoing",
      department,
      fkCurrentStepId: stepId,
    })
    .returning({ id: userFlow.id });
  createdUserFlowIds.push(row.id);
  return row.id;
};

describe("阅卷入口的部门隔离", () => {
  let ownFlowId = 0;
  let otherFlowId = 0;

  beforeAll(async () => {
    const own = await createFlowWithProblem("publicity", "SMOKE-阅卷-科宣部");
    ownFlowId = own.flowId;
    await createCandidate(CANDIDATE_ID, ownFlowId, "publicity", own.stepId);

    const other = await createFlowWithProblem("software", "SMOKE-阅卷-软件部");
    otherFlowId = other.flowId;
    await createCandidate(
      OTHER_DEPARTMENT_CANDIDATE_ID,
      otherFlowId,
      "software",
      other.stepId,
    );
  });

  afterAll(async () => {
    if (createdUserFlowIds.length > 0) {
      await db.delete(userFlow).where(inArray(userFlow.id, createdUserFlowIds));
    }
    if (createdFlowIds.length > 0) {
      const stepRows = await db
        .select({ id: flowStep.id })
        .from(flowStep)
        .where(inArray(flowStep.fkFlowId, createdFlowIds));
      const stepIds = stepRows.map((row) => row.id);
      if (stepIds.length > 0) {
        await db.delete(problem).where(inArray(problem.fkFlowStepId, stepIds));
      }
      await db.delete(flowStep).where(inArray(flowStep.fkFlowId, createdFlowIds));
      await db.delete(flow).where(inArray(flow.id, createdFlowIds));
    }
  });

  beforeEach(() => {
    mockSession.role = 2;
    mockSession.department = "publicity";
    mockSession.scope = { kind: "department", department: "publicity" };
  });

  it("不返回其他部门流程的题目与考生", async () => {
    await expect(calScore(otherFlowId)).resolves.toEqual([]);
  });

  it("本部门流程正常返回题目与考生", async () => {
    const rows = await calScore(ownFlowId);
    expect(rows).toHaveLength(1);
    expect(rows[0].problemScores.map((item) => item.title)).toEqual([
      "SMOKE-阅卷-科宣部 题目",
    ]);
  });

  it("阅卷入口要求讲师及以上：部员被拒绝", async () => {
    mockSession.role = 1;
    mockSession.scope = { kind: "department", department: "publicity" };
    (findPeopleUserByStudentId as jest.Mock).mockResolvedValue({
      id: CANDIDATE_ID,
      name: "候选人",
    });

    await expect(findUserFlowId("B24040001", ownFlowId)).rejects.toThrow(
      "Unauthorized operation",
    );
  });

  it("讲师只能定位本部门候选人", async () => {
    (findPeopleUserByStudentId as jest.Mock).mockImplementation(
      async (studentId: string) => ({
        id: studentId === "B24040002" ? OTHER_DEPARTMENT_CANDIDATE_ID : CANDIDATE_ID,
        name: "候选人",
      }),
    );

    await expect(findUserFlowId("B24040001", ownFlowId)).resolves.toMatchObject({
      progressStatus: "ongoing",
    });
    await expect(
      findUserFlowId("B24040002", otherFlowId),
    ).rejects.toThrow("该同学不属于当前部门");
  });
});
