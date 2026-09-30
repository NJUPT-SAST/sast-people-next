/** @jest-environment node */

jest.mock("next/cache", () => ({
  revalidatePath: jest.fn(),
  revalidateTag: jest.fn(),
}));

jest.mock("@/lib/operation-audit", () => ({
  writeOperationAudit: jest.fn(async () => undefined),
}));

jest.mock("@/lib/server-error-log", () => ({
  logServerError: jest.fn(),
}));

jest.mock("@/lib/link/user-lookup", () => ({
  listPeopleUsersByLinkIds: jest.fn(async () => new Map()),
}));

jest.mock("@/lib/authz", () => {
  const actual = jest.requireActual("@/lib/authz");
  const session = {
    uid: 900991,
    role: 3,
    department: "publicity",
    scope: { kind: "department", department: "publicity" },
  };
  return {
    ...actual,
    verifyManager: jest.fn(async () => session),
    verifyScopedRole: jest.fn(async () => session),
  };
});

import { db } from "@/db/drizzle";
import {
  flow,
  flowStep,
  interviewEvaluation,
  interviewSlotChangeRequest,
  userFlow,
} from "@/db/schema";
import { eq, inArray, like } from "drizzle-orm";
import {
  approveEvaluation,
  createEvaluation,
  getAllEvaluations,
  getEvaluationCandidates,
  rejectEvaluation,
  returnEvaluation,
} from "@/action/user-flow/evaluation";
import {
  listPendingSlotChangeRequests,
  reviewInterviewSlotChange,
} from "@/action/user-flow/interview-slot-change";

/* 办公类部门面试招新：每个办公部门一条流程（flow.department = 办公部门）。
   审批账号属于办公部门 publicity（role 3），只能操作本部门流程的候选人。 */
const VIEWER_ID = 900991;
const CANDIDATE_ID = 900992;

/* VIEWER 本部门的流程（publicity） */
let flowId = 0;
/* 另一个办公部门的流程（office）：用于验证部门隔离 */
let officeFlowId = 0;
let userFlowId = 0;
let secondUserFlowId = 0;
let officeUserFlowId = 0;
const stepIdByOrder = new Map<number, number>();

const createOfficeFlow = async (title: string, department: string) => {
  const [created] = await db
    .insert(flow)
    .values({
      title,
      type: "office_interview",
      department,
      ownerId: VIEWER_ID,
      slotOptions: [{ label: "13:00-14:00" }, { label: "15:00-16:00" }],
    })
    .returning({ id: flow.id });

  const steps = await db
    .insert(flowStep)
    .values([
      { title: "报名", type: "registering" as const, order: 1, fkFlowId: created.id },
      { title: "一面面试", type: "checking" as const, order: 2, fkFlowId: created.id },
      { title: "二轮面试", type: "checking" as const, order: 3, fkFlowId: created.id },
      { title: "结果确认", type: "finished" as const, order: 4, fkFlowId: created.id },
    ])
    .returning({ id: flowStep.id, order: flowStep.order });

  return { flowId: created.id, steps };
};

const insertCandidate = async (
  userId: number,
  round: number,
  targetFlowId: number,
  stepId: number | null,
  choice: number,
  department: string,
) => {
  const [row] = await db
    .insert(userFlow)
    .values({
      fkFlowId: targetFlowId,
      fkUserId: userId,
      progressStatus: "ongoing",
      department,
      applyGroup: "办公室",
      choice,
      round,
      interviewSlot: "13:00-14:00",
      fkCurrentStepId: stepId,
    })
    .returning({ id: userFlow.id });
  return row.id;
};

const insertEvaluation = async (
  candidateUserFlowId: number,
  round: number,
  authorId: number,
  status: "submitted" | "approved" = "submitted",
) => {
  const [row] = await db
    .insert(interviewEvaluation)
    .values({
      fkUserFlowId: candidateUserFlowId,
      fkUserId: authorId,
      content: "一面表现不错，技术基础扎实，沟通清晰，建议进入二轮。",
      score: 88,
      round,
      recommendation: "passed",
      status,
    })
    .returning({ id: interviewEvaluation.id });
  return row.id;
};

const readCandidate = async (id: number) => {
  const [row] = await db
    .select({
      round: userFlow.round,
      status: userFlow.progressStatus,
      stepId: userFlow.fkCurrentStepId,
    })
    .from(userFlow)
    .where(eq(userFlow.id, id))
    .limit(1);
  return row;
};

beforeAll(async () => {
  const publicity = await createOfficeFlow("SMOKE-办公类流程-科宣部", "publicity");
  flowId = publicity.flowId;
  for (const step of publicity.steps) stepIdByOrder.set(step.order, step.id);

  const office = await createOfficeFlow("SMOKE-办公类流程-办公室", "office");
  officeFlowId = office.flowId;

  userFlowId = await insertCandidate(
    CANDIDATE_ID,
    1,
    flowId,
    stepIdByOrder.get(2) ?? null,
    1,
    "publicity",
  );
  secondUserFlowId = await insertCandidate(
    CANDIDATE_ID + 1,
    1,
    flowId,
    stepIdByOrder.get(2) ?? null,
    1,
    "publicity",
  );
  /* 同一候选人的第二志愿：另一个办公部门流程里的报名记录 */
  officeUserFlowId = await insertCandidate(
    CANDIDATE_ID,
    1,
    officeFlowId,
    null,
    2,
    "office",
  );
});

afterAll(async () => {
  const smokeFlows = await db
    .select({ id: flow.id })
    .from(flow)
    .where(like(flow.title, "SMOKE-%"));
  const flowIds = smokeFlows.map((row) => row.id);
  if (flowIds.length === 0) return;

  const candidates = await db
    .select({ id: userFlow.id })
    .from(userFlow)
    .where(inArray(userFlow.fkFlowId, flowIds));
  const candidateIds = candidates.map((row) => row.id);
  if (candidateIds.length > 0) {
    await db
      .delete(interviewSlotChangeRequest)
      .where(inArray(interviewSlotChangeRequest.fkUserFlowId, candidateIds));
    await db
      .delete(interviewEvaluation)
      .where(inArray(interviewEvaluation.fkUserFlowId, candidateIds));
    await db.delete(userFlow).where(inArray(userFlow.id, candidateIds));
  }
  await db.delete(flow).where(inArray(flow.id, flowIds));
});

describe("办公类部门流程的轮次推进", () => {
  let roundOneEvaluationId = 0;
  let roundTwoEvaluationId = 0;

  it("部长可以为本部门流程的候选人写面评，并记录当前轮次", async () => {
    const result = await createEvaluation(
      userFlowId,
      "一面表现不错，技术基础扎实，沟通表达清晰，建议进入二轮面试继续考察。",
      "passed",
      undefined,
      88,
    );
    if (!result.success) throw new Error(JSON.stringify(result));

    const createdId = result.data?.id;
    if (createdId === undefined) throw new Error("面评未返回 id");

    const [row] = await db
      .select({ round: interviewEvaluation.round, status: interviewEvaluation.status })
      .from(interviewEvaluation)
      .where(eq(interviewEvaluation.id, createdId))
      .limit(1);
    expect(row).toEqual({ round: 1, status: "submitted" });

    const candidate = await readCandidate(userFlowId);
    expect(candidate.round).toBe(1);

    roundOneEvaluationId = createdId;
    roundTwoEvaluationId = await insertEvaluation(userFlowId, 2, VIEWER_ID + 1);
  });

  it("二面面评不能在一面通过前审批", async () => {
    await expect(approveEvaluation(roundTwoEvaluationId)).rejects.toThrow(
      "请先完成一面审批",
    );
  });

  it("一面面评通过后候选人进入二轮面试且状态仍为进行中", async () => {
    await approveEvaluation(roundOneEvaluationId);

    const candidate = await readCandidate(userFlowId);
    expect(candidate.round).toBe(2);
    expect(candidate.status).toBe("ongoing");
    expect(candidate.stepId).toBe(stepIdByOrder.get(3));
  });

  it("候选人已进入二轮后不能再审批此前的一面面评", async () => {
    const staleRoundOne = await insertEvaluation(userFlowId, 1, VIEWER_ID + 2);
    await expect(approveEvaluation(staleRoundOne)).rejects.toThrow(
      "该候选人已进入二轮面试",
    );
  });

  it("二面面评通过后候选人结果为通过并进入结果确认", async () => {
    await approveEvaluation(roundTwoEvaluationId);

    const candidate = await readCandidate(userFlowId);
    expect(candidate.round).toBe(2);
    expect(candidate.status).toBe("passed");
    expect(candidate.stepId).toBe(stepIdByOrder.get(4));
  });

  it("列表返回候选人轮次，且均分只统计当前轮次的面评", async () => {
    const candidates = await getEvaluationCandidates(flowId);
    const target = candidates.find((candidate) => candidate.userFlowId === userFlowId);
    expect(target).toBeDefined();
    if (!target) throw new Error("candidate missing");

    expect(target.round).toBe(2);
    /* 二轮只有一份 submitted 面评：均分与份数都按二轮统计 */
    expect(target.evaluationCount).toBe(1);
    expect(target.averageScore).toBe(88);
    expect(target.evaluations.map((evaluation) => evaluation.round)).toEqual(
      expect.arrayContaining([1, 2]),
    );
  });

  it("列表带出志愿顺序与另一条办公类报名的部门", async () => {
    const candidates = await getEvaluationCandidates(flowId);
    const target = candidates.find((candidate) => candidate.userFlowId === userFlowId);
    if (!target) throw new Error("candidate missing");

    /* 本部门流程里的报名是第一志愿，另一条办公类报名属于办公部门 office */
    expect(target.choice).toBe(1);
    expect(target.department).toBe("publicity");
    expect(target.siblingDepartment).toBe("office");

    const single = candidates.find(
      (candidate) => candidate.userFlowId === secondUserFlowId,
    );
    expect(single?.siblingDepartment).toBeNull();
  });

  it("另一个办公部门的流程对本部门部长不可见", async () => {
    expect(await getEvaluationCandidates(officeFlowId)).toEqual([]);

    await expect(
      createEvaluation(
        officeUserFlowId,
        "越权面评内容至少要有二十个字符才可以通过校验",
        "failed",
        undefined,
        10,
      ),
    ).rejects.toThrow("无权操作其他部门的候选人");

    const approvalRows = await getAllEvaluations();
    expect(approvalRows.some((row) => row.department === "office")).toBe(false);
    expect(
      approvalRows.some((row) => row.evaluation.fkUserFlowId === userFlowId),
    ).toBe(true);
  });

  it("退回面评保持原行为，驳回则结果为不通过并进入结果确认", async () => {
    const revertible = await insertEvaluation(secondUserFlowId, 2, VIEWER_ID + 3);
    const returned = await returnEvaluation(revertible, "请补充细节");
    expect(returned.success).toBe(true);

    const [returnedRow] = await db
      .select({ status: interviewEvaluation.status })
      .from(interviewEvaluation)
      .where(eq(interviewEvaluation.id, revertible))
      .limit(1);
    expect(returnedRow.status).toBe("returned");
    expect((await readCandidate(secondUserFlowId)).status).toBe("ongoing");

    const rejected = await insertEvaluation(secondUserFlowId, 2, VIEWER_ID + 3);
    await rejectEvaluation(rejected);

    const candidate = await readCandidate(secondUserFlowId);
    expect(candidate.status).toBe("failed");
    expect(candidate.stepId).toBe(stepIdByOrder.get(4));
  });

  it("看不到非办公类流程的候选人", async () => {
    const [otherFlow] = await db
      .insert(flow)
      .values({
        title: "SMOKE-普通部门流程",
        type: "recruitment_exemption",
        department: "software",
        ownerId: VIEWER_ID,
      })
      .returning({ id: flow.id });
    const [otherStep] = await db
      .insert(flowStep)
      .values({
        title: "面试",
        type: "checking",
        order: 2,
        fkFlowId: otherFlow.id,
      })
      .returning({ id: flowStep.id });
    const [otherCandidate] = await db
      .insert(userFlow)
      .values({
        fkFlowId: otherFlow.id,
        fkUserId: CANDIDATE_ID + 2,
        progressStatus: "ongoing",
        department: "software",
        fkCurrentStepId: otherStep.id,
      })
      .returning({ id: userFlow.id });

    const candidates = await getEvaluationCandidates(otherFlow.id);
    expect(candidates).toEqual([]);
    await expect(
      createEvaluation(otherCandidate.id, "越权面评内容至少要有二十个字符才可以通过校验", "failed", undefined, 10),
    ).rejects.toThrow("无权操作其他部门的候选人");

    const [softwareEvaluation] = await db
      .insert(interviewEvaluation)
      .values({
        fkUserFlowId: otherCandidate.id,
        fkUserId: VIEWER_ID + 5,
        content: "软件部门候选人的面评内容，办公类账号不应看到。",
        score: 70,
        recommendation: "passed",
        status: "submitted",
      })
      .returning({ id: interviewEvaluation.id });

    const approvalRows = await getAllEvaluations();
    expect(approvalRows.some((row) => row.evaluation.id === softwareEvaluation.id)).toBe(false);
    expect(
      approvalRows.some((row) => row.evaluation.fkUserFlowId === userFlowId),
    ).toBe(true);
  });

  it("部长能看到并审批本部门流程的改时段申请", async () => {
    const [request] = await db
      .insert(interviewSlotChangeRequest)
      .values({
        fkUserFlowId: userFlowId,
        requestedSlot: "15:00-16:00",
        reason: "课程冲突",
        fkRequestedBy: CANDIDATE_ID,
      })
      .returning({ id: interviewSlotChangeRequest.id });

    const pending = await listPendingSlotChangeRequests();
    expect(pending.map((row) => row.id)).toContain(request.id);

    const result = await reviewInterviewSlotChange(request.id, true);
    expect(result).toEqual({ success: true, appliedSlot: "15:00-16:00" });

    const [candidate] = await db
      .select({ slot: userFlow.interviewSlot })
      .from(userFlow)
      .where(eq(userFlow.id, userFlowId))
      .limit(1);
    expect(candidate.slot).toBe("15:00-16:00");
  });
});
