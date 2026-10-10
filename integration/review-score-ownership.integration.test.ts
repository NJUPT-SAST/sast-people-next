/** @jest-environment node */

/**
 * 评分归属（user_point.fk_judger_id）语义：
 * - 题目归属由第一位保存者占用：其他讲师改同一题被 409 拒绝，且分数不落库；
 * - 批量提交遇到归属冲突整批回滚（讲师不能靠批量绕过归属）；
 * - 部长及以上可覆盖他人评分，审计里能查到覆盖前后的阅卷人；
 * - 讲师本人重复保存同一分数不产生新的审计记录。
 */

jest.mock("@/lib/server-error-log", () => ({
  logServerError: jest.fn(),
}));

jest.mock("@/lib/link/user-lookup", () => ({
  listPeopleUsersByLinkIds: jest.fn(async () => new Map()),
}));

import type * as authzModule from "@/lib/authz";

type MockSession = {
  uid: number;
  role: number;
  realRole: number;
  name: string;
  department: string | null;
  scope:
    | { kind: "all" }
    | { kind: "department"; department: string }
    | { kind: "none" };
};

const mockSession: MockSession = {
  uid: 910001,
  role: 2,
  realRole: 2,
  name: "讲师甲",
  department: "publicity",
  scope: { kind: "department", department: "publicity" },
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

import { and, eq, inArray } from "drizzle-orm";

import { db } from "@/db/drizzle";
import { flow, flowStep, operationAudit, problem, userFlow, userPoint } from "@/db/schema";
import {
  ReviewPointConflictError,
  ScoreValidationError,
  batchUpsertPoint,
  upsertPoint,
} from "@/action/user-flow/user-point/upsert";

const LECTURER_A = 910001;
const LECTURER_B = 910002;
const MANAGER_C = 910003;
const CANDIDATE_ID = 910004;

type AuditMetadata = {
  targetUserId?: number;
  saveCount?: number;
  scoreChanges?: Array<Record<string, unknown>>;
};

const createdFlowIds: number[] = [];

const readPoint = async (userFlowId: number, problemId: number) => {
  const [row] = await db
    .select({ points: userPoint.points, judgerId: userPoint.fkJudgerId })
    .from(userPoint)
    .where(
      and(eq(userPoint.fkUserFlowId, userFlowId), eq(userPoint.fkProblemId, problemId)),
    );
  return row ?? null;
};

const readAuditMetadata = async (actorId: number, userFlowId: number) => {
  const [row] = await db
    .select({ metadata: operationAudit.metadata })
    .from(operationAudit)
    .where(
      and(
        eq(operationAudit.actorId, actorId),
        eq(operationAudit.action, "review.score.upsert"),
        eq(operationAudit.resourceId, userFlowId),
      ),
    );
  return (row?.metadata ?? null) as AuditMetadata | null;
};

describe("评分归属与覆盖审计", () => {
  let userFlowId = 0;
  let firstProblemId = 0;
  let sharedProblemId = 0;
  let passedUserFlowId = 0;
  let withdrawnUserFlowId = 0;

  const actAs = (uid: number, role: number) => {
    mockSession.uid = uid;
    mockSession.role = role;
    mockSession.realRole = role;
  };

  beforeAll(async () => {
    const [flowRow] = await db
      .insert(flow)
      .values({
        title: "SMOKE-评分归属-科宣部",
        type: "recruitment",
        department: "publicity",
        ownerId: LECTURER_A,
      })
      .returning({ id: flow.id });
    createdFlowIds.push(flowRow.id);

    const [step] = await db
      .insert(flowStep)
      .values({ title: "笔试", type: "checking", order: 2, fkFlowId: flowRow.id })
      .returning({ id: flowStep.id });

    const problems = await db
      .insert(problem)
      .values([
        { title: "SMOKE-归属-题一", score: 100, fkFlowStepId: step.id },
        { title: "SMOKE-归属-题二", score: 100, fkFlowStepId: step.id },
      ])
      .returning({ id: problem.id });
    firstProblemId = problems[0].id;
    sharedProblemId = problems[1].id;

    const [candidate] = await db
      .insert(userFlow)
      .values({
        fkFlowId: flowRow.id,
        fkUserId: CANDIDATE_ID,
        progressStatus: "ongoing",
        department: "publicity",
        fkCurrentStepId: step.id,
      })
      .returning({ id: userFlow.id });
    userFlowId = candidate.id;

    /* 结果已确认 / 已退回的考生：用于验证写路径的状态守卫 */
    const finalStatusCandidates = await db
      .insert(userFlow)
      .values([
        {
          fkFlowId: flowRow.id,
          fkUserId: CANDIDATE_ID + 10,
          progressStatus: "passed",
          department: "publicity",
          fkCurrentStepId: step.id,
        },
        {
          fkFlowId: flowRow.id,
          fkUserId: CANDIDATE_ID + 11,
          progressStatus: "withdrawn",
          department: "publicity",
          fkCurrentStepId: step.id,
        },
      ])
      .returning({ id: userFlow.id });
    passedUserFlowId = finalStatusCandidates[0].id;
    withdrawnUserFlowId = finalStatusCandidates[1].id;
  });

  afterAll(async () => {
    await db
      .delete(operationAudit)
      .where(
        and(
          eq(operationAudit.resourceType, "user_flow"),
          inArray(operationAudit.resourceId, [
            userFlowId,
            passedUserFlowId,
            withdrawnUserFlowId,
          ]),
        ),
      );
    const candidateRows = [userFlowId, passedUserFlowId, withdrawnUserFlowId].filter(
      (id) => id > 0,
    );
    if (candidateRows.length > 0) {
      await db.delete(userFlow).where(inArray(userFlow.id, candidateRows));
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
    actAs(LECTURER_A, 2);
  });

  it("第一位保存者占用题目，其他讲师改动被拒且分数不落库", async () => {
    await expect(upsertPoint(userFlowId, sharedProblemId, 88)).resolves.toBeUndefined();
    expect(await readPoint(userFlowId, sharedProblemId)).toEqual({
      points: 88,
      judgerId: LECTURER_A,
    });

    actAs(LECTURER_B, 2);
    const error = await upsertPoint(userFlowId, sharedProblemId, 90).catch(
      (thrown: unknown) => thrown,
    );

    expect(error).toBeInstanceOf(ReviewPointConflictError);
    expect((error as ReviewPointConflictError).conflicts).toEqual([sharedProblemId]);
    expect(await readPoint(userFlowId, sharedProblemId)).toEqual({
      points: 88,
      judgerId: LECTURER_A,
    });
  });

  it("批量提交遇到归属冲突时整批回滚，讲师无法绕过归属", async () => {
    actAs(LECTURER_B, 2);
    const error = await batchUpsertPoint([
      { fkUserFlowId: userFlowId, fkProblemId: firstProblemId, points: 50, note: null },
      { fkUserFlowId: userFlowId, fkProblemId: sharedProblemId, points: 60, note: null },
    ]).catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(ReviewPointConflictError);
    expect((error as ReviewPointConflictError).conflicts).toEqual([sharedProblemId]);
    expect(await readPoint(userFlowId, firstProblemId)).toBeNull();
    expect(await readPoint(userFlowId, sharedProblemId)).toEqual({
      points: 88,
      judgerId: LECTURER_A,
    });
  });

  it("部长覆盖他人评分成功，审计记录覆盖前后的阅卷人", async () => {
    actAs(MANAGER_C, 3);
    await expect(upsertPoint(userFlowId, sharedProblemId, 95)).resolves.toBeUndefined();
    expect(await readPoint(userFlowId, sharedProblemId)).toEqual({
      points: 95,
      judgerId: MANAGER_C,
    });

    const metadata = await readAuditMetadata(MANAGER_C, userFlowId);
    expect(metadata?.targetUserId).toBe(CANDIDATE_ID);
    expect(metadata?.scoreChanges?.[0]).toMatchObject({
      problemId: sharedProblemId,
      previousScore: 88,
      nextScore: 95,
      previousJudgerId: LECTURER_A,
      nextJudgerId: MANAGER_C,
    });
  });

  it("结果已确认或已退回的考生，讲师写分被明确拒绝且不落库", async () => {
    actAs(LECTURER_A, 2);

    const passedError = await upsertPoint(passedUserFlowId, firstProblemId, 70).catch(
      (thrown: unknown) => thrown,
    );
    expect(passedError).toBeInstanceOf(ScoreValidationError);
    expect((passedError as ScoreValidationError).message).toBe(
      "该考生笔试结果已确认，不能再修改评分",
    );
    expect(await readPoint(passedUserFlowId, firstProblemId)).toBeNull();

    const withdrawnError = await upsertPoint(
      withdrawnUserFlowId,
      firstProblemId,
      70,
    ).catch((thrown: unknown) => thrown);
    expect(withdrawnError).toBeInstanceOf(ScoreValidationError);
    expect((withdrawnError as ScoreValidationError).message).toBe(
      "该考生已退回当前流程，不能再修改评分",
    );
    expect(await readPoint(withdrawnUserFlowId, firstProblemId)).toBeNull();
  });

  it("部长仍可给已退回的考生改分（误确认后的更正通道）", async () => {
    actAs(MANAGER_C, 3);

    await expect(upsertPoint(withdrawnUserFlowId, firstProblemId, 70)).resolves.toBeUndefined();
    expect(await readPoint(withdrawnUserFlowId, firstProblemId)).toEqual({
      points: 70,
      judgerId: MANAGER_C,
    });
  });

  it("讲师本人重复保存同一分数不产生新的评分变更记录", async () => {
    actAs(LECTURER_A, 2);
    await expect(upsertPoint(userFlowId, firstProblemId, 10)).resolves.toBeUndefined();
    const afterFirstSave = await readAuditMetadata(LECTURER_A, userFlowId);
    expect(afterFirstSave?.saveCount).toBe(2);
    expect(afterFirstSave?.scoreChanges).toHaveLength(2);

    await expect(upsertPoint(userFlowId, firstProblemId, 10)).resolves.toBeUndefined();
    const afterRepeatSave = await readAuditMetadata(LECTURER_A, userFlowId);
    expect(afterRepeatSave?.saveCount).toBe(2);
    expect(afterRepeatSave?.scoreChanges).toHaveLength(2);
    expect(await readPoint(userFlowId, firstProblemId)).toEqual({
      points: 10,
      judgerId: LECTURER_A,
    });
  });
});
