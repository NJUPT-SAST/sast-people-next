/** @jest-environment node */

jest.mock("next/cache", () => ({
  revalidatePath: jest.fn(),
  revalidateTag: jest.fn(),
  unstable_cache: (fn: unknown) => fn,
}));

jest.mock("@/lib/operation-audit", () => {
  const actual = jest.requireActual<typeof OperationAuditModule>(
    "@/lib/operation-audit",
  );
  /* 「全部面试记录」要读名单确认留档，所以这里走真实写入（其他用例不校验审计调用） */
  return { ...actual, writeOperationAudit: jest.fn(actual.writeOperationAudit) };
});

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
  emailBatch,
  emailDelivery,
  flow,
  flowResultPublication,
  flowStep,
  interviewEvaluation,
  interviewSchedule,
  interviewSlotChangeRequest,
  operationAudit,
  userFlow,
} from "@/db/schema";
import { and, eq, inArray, like } from "drizzle-orm";
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
import { closeOfficeRoundOne, closeOfficeRoundTwo } from "@/action/user-flow/office-rounds";
import { setOfficeFinalDestination } from "@/action/user-flow/office-final-destination";
import { updateCandidateInterviewSlot } from "@/action/user-flow/interview-slot";
import { getOfficeInterviewRecord } from "@/action/user-flow/office-record";
import { listPeopleUsersByLinkIds } from "@/lib/link/user-lookup";
import type * as OperationAuditModule from "@/lib/operation-audit";

/* 办公类部门面试招新：每个办公部门一条流程（flow.department = 办公部门）。
   审批账号属于办公部门 publicity（role 3），只能操作本部门流程的候选人。
   办公类没有面评审批：面试记录（内容 + 分数）只留档，结果由部长在名单确认时决定。 */
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
  score = 88,
) => {
  const [row] = await db
    .insert(interviewEvaluation)
    .values({
      fkUserFlowId: candidateUserFlowId,
      fkUserId: authorId,
      content: "一面表现不错，技术基础扎实，沟通清晰，建议进入二轮。",
      score,
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

const readEvaluation = async (id: number) => {
  const [row] = await db
    .select({
      status: interviewEvaluation.status,
      score: interviewEvaluation.score,
      recommendation: interviewEvaluation.recommendation,
      round: interviewEvaluation.round,
    })
    .from(interviewEvaluation)
    .where(eq(interviewEvaluation.id, id))
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
  /* 结果发布留下的邮件与发布记录会引用流程（on delete restrict），必须先清掉 */
  await db.delete(emailDelivery).where(inArray(emailDelivery.fkFlowId, flowIds));
  await db.delete(emailBatch).where(inArray(emailBatch.fkFlowId, flowIds));
  await db
    .delete(flowResultPublication)
    .where(inArray(flowResultPublication.fkFlowId, flowIds));
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

  it("部长可以为本部门流程的候选人写面评（内容 + 分数），提交后直接归档", async () => {
    const result = await createEvaluation(
      userFlowId,
      "一面表现不错，技术基础扎实，沟通表达清晰，可以进入二面面试继续考察。",
      "passed",
      undefined,
      88,
    );
    if (!result.success) throw new Error(JSON.stringify(result));

    const createdId = result.data?.id;
    if (createdId === undefined) throw new Error("面评未返回 id");

    const row = await readEvaluation(createdId);
    /* 办公类面评留档：轮次 + 分数 + 内容 + 可选「面试意见」（仅供参考，不影响结果判定） */
    expect(row).toEqual({
      round: 1,
      status: "submitted",
      score: 88,
      recommendation: "passed",
    });

    const candidate = await readCandidate(userFlowId);
    expect(candidate.round).toBe(1);

    roundOneEvaluationId = createdId;
    roundTwoEvaluationId = await insertEvaluation(userFlowId, 2, VIEWER_ID + 1);
  });

  it("办公类没有面评审批：审批、驳回、退回都被拒绝且不影响候选人", async () => {
    await expect(approveEvaluation(roundOneEvaluationId)).rejects.toThrow(
      "无需面评审批",
    );
    await expect(rejectEvaluation(roundOneEvaluationId)).rejects.toThrow(
      "无需面评审批",
    );
    await expect(
      returnEvaluation(roundOneEvaluationId, "请补充细节"),
    ).rejects.toThrow("无需面评审批");
    /* 二面面评同样不需要审批，不会因为「一面未审批」而阻塞 */
    await expect(approveEvaluation(roundTwoEvaluationId)).rejects.toThrow(
      "无需面评审批",
    );

    expect(await readEvaluation(roundOneEvaluationId)).toMatchObject({
      status: "submitted",
    });
    const candidate = await readCandidate(userFlowId);
    expect(candidate.round).toBe(1);
    expect(candidate.status).toBe("ongoing");
  });

  it("一面名单确认：通过者进入二面且状态仍为进行中，未通过者结果直接为不通过", async () => {
    const result = await closeOfficeRoundOne(
      flowId,
      [
        { userFlowId, passed: true },
        { userFlowId: secondUserFlowId, passed: false },
      ],
      [userFlowId, secondUserFlowId],
      true,
    );
    if (!result.success) throw new Error(JSON.stringify(result));
    expect(result.passCount).toBe(1);
    expect(result.rejectCount).toBe(1);

    const passed = await readCandidate(userFlowId);
    expect(passed.round).toBe(2);
    expect(passed.status).toBe("ongoing");
    expect(passed.stepId).toBe(stepIdByOrder.get(3));

    const rejected = await readCandidate(secondUserFlowId);
    expect(rejected.status).toBe("failed");
    expect(rejected.stepId).toBe(stepIdByOrder.get(4));
  });

  it("名单确认必须覆盖全部待确认的候选人", async () => {
    const result = await closeOfficeRoundTwo(flowId, [], [], true);
    expect(result.success).toBe(false);
    if (result.success) throw new Error("未确认名单时不应成功");
    expect(result.error.message).toContain("未确认结果");
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

  it("二面名单确认写入最终结果并调用结果发布（本地无邮件服务时给出可重试的提示）", async () => {
    const result = await closeOfficeRoundTwo(
      flowId,
      [{ userFlowId, passed: true }],
      [userFlowId],
      true,
    );

    /* 集成环境没有邮件服务：名单已经确认，只有结果发布失败，提示要能原样展示给部长 */
    expect(result.success).toBe(false);
    if (result.success) throw new Error("无邮件服务时不应发布成功");
    expect(result.error.message).toContain("名单已确认，但结果发布失败");

    const candidate = await readCandidate(userFlowId);
    expect(candidate.status).toBe("passed");
    expect(candidate.round).toBe(2);
    expect(candidate.stepId).toBe(stepIdByOrder.get(4));

    const [publication] = await db
      .select({ status: flowResultPublication.status })
      .from(flowResultPublication)
      .where(eq(flowResultPublication.fkFlowId, flowId))
      .limit(1);
    expect(publication?.status).toBe("failed");
  });

  it("名单已确认时可重试发布：不需要再确认名单，结果可以发布成功", async () => {
    /* 重试时没有待确认候选人，且本次不发送邮件（无邮件服务的环境） */
    const result = await closeOfficeRoundTwo(flowId, [], [], true);
    expect(result).toEqual({ success: true, publishedCount: 2 });

    const [publication] = await db
      .select({ status: flowResultPublication.status })
      .from(flowResultPublication)
      .where(eq(flowResultPublication.fkFlowId, flowId))
      .limit(1);
    expect(publication?.status).toBe("published");
  });

  it("另一个办公部门的流程对本部门部长不可见，面评也不进审批列表", async () => {
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

    /* 办公类没有面评审批：本部门流程的面评也不会出现在审批列表里 */
    const approvalRows = await getAllEvaluations();
    expect(approvalRows.some((row) => row.department === "office")).toBe(false);
    expect(
      approvalRows.some((row) => row.evaluation.fkUserFlowId === userFlowId),
    ).toBe(false);
    expect(approvalRows.some((row) => row.flowType === "office_interview")).toBe(
      false,
    );
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
  });

  it("办公类改期申请已下线：存量 pending 记录不再可见也无法审批", async () => {
    /* 办公类「申请改时段 → 部长审批」整体下线，改由部长在面试管理页直接修改 */
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
    expect(pending.map((row) => row.id)).not.toContain(request.id);

    await expect(
      reviewInterviewSlotChange(request.id, true),
    ).rejects.toThrow("该流程不支持修改面试时间");

    const [unchanged] = await db
      .select({ slot: userFlow.interviewSlot })
      .from(userFlow)
      .where(eq(userFlow.id, userFlowId))
      .limit(1);
    expect(unchanged.slot).not.toBe("15:00-16:00");
  });
});

describe("办公类全部面试记录", () => {
  const RECORD_CANDIDATE_ID = CANDIDATE_ID + 50;
  /* 记录用例自己的流程，避免与上面 describe 的轮次状态互相干扰 */
  let recordFlowId = 0;
  let recordSiblingFlowId = 0;
  let recordUserFlowId = 0;
  let recordSiblingUserFlowId = 0;
  let recordStepId = 0;

  beforeAll(async () => {
    const owned = await createOfficeFlow("SMOKE-办公类流程-记录-科宣部", "publicity");
    recordFlowId = owned.flowId;
    recordStepId = owned.steps.find((step) => step.order === 2)?.id ?? 0;

    const sibling = await createOfficeFlow("SMOKE-办公类流程-记录-办公室", "office");
    recordSiblingFlowId = sibling.flowId;

    /* 同一候选人的两条办公类报名：第一志愿在科宣部，第二志愿在办公室 */
    recordUserFlowId = await insertCandidate(
      RECORD_CANDIDATE_ID,
      1,
      recordFlowId,
      recordStepId,
      1,
      "publicity",
    );
    recordSiblingUserFlowId = await insertCandidate(
      RECORD_CANDIDATE_ID,
      1,
      recordSiblingFlowId,
      null,
      2,
      "office",
    );

    /* 姓名/学号 QQ 由 Link 查询补齐：这里给出稳定映射，断言操作人与面试官姓名 */
    (listPeopleUsersByLinkIds as jest.Mock).mockImplementation(async () =>
      new Map([
        [
          RECORD_CANDIDATE_ID,
          {
            id: RECORD_CANDIDATE_ID,
            name: "记录候选人",
            studentId: "B24040999",
            qq: "10086",
          },
        ],
        [VIEWER_ID, { id: VIEWER_ID, name: "部长甲", studentId: "S900991", qq: null }],
        [VIEWER_ID + 7, { id: VIEWER_ID + 7, name: "部长乙", studentId: "S900998", qq: null }],
      ]),
    );
  });

  it("一面面评与名单确认后，记录带出确认时刻的分数快照与操作人", async () => {
    await insertEvaluation(recordUserFlowId, 1, VIEWER_ID + 7, "submitted", 88);
    await insertEvaluation(recordUserFlowId, 1, VIEWER_ID + 7, "submitted", 90);

    const confirmed = await closeOfficeRoundOne(
      recordFlowId,
      [{ userFlowId: recordUserFlowId, passed: true }],
      [recordUserFlowId],
      true,
    );
    expect(confirmed.success).toBe(true);

    const record = await getOfficeInterviewRecord(recordUserFlowId);

    expect(record.candidate).toMatchObject({
      userFlowId: recordUserFlowId,
      name: "记录候选人",
      studentId: "B24040999",
      qq: "10086",
      choice: 1,
      /* 另一条办公类报名（第二志愿）的部门 */
      siblingDepartment: "office",
      interviewSlot: "13:00-14:00",
      status: "ongoing",
      round: 2,
      finalDepartment: null,
    });

    expect(record.rounds.map((round) => round.round)).toEqual([1, 2]);
    expect(record.rounds[0].averageScore).toBe(89);
    expect(record.rounds[0].evaluations).toHaveLength(2);
    expect(record.rounds[0].evaluations[0]).toMatchObject({
      score: 88,
      authorName: "部长乙",
      isMine: false,
    });
    expect(record.rounds[0].decision).toMatchObject({
      passed: true,
      decidedBy: "部长甲",
      evaluationCount: 2,
      averageScore: 89,
    });
    expect(record.rounds[0].decision?.decidedAt).toEqual(expect.any(String));

    /* 二面尚未开始：空轮次、无名单确认 */
    expect(record.rounds[1].evaluations).toEqual([]);
    expect(record.rounds[1].averageScore).toBeNull();
    expect(record.rounds[1].decision).toBeNull();
  });

  it("二面多位部长打分取平均，名单确认后写入快照", async () => {
    await insertEvaluation(recordUserFlowId, 2, VIEWER_ID + 7, "submitted", 80);
    await insertEvaluation(recordUserFlowId, 2, VIEWER_ID, "submitted", 90);

    const beforeDecision = await getOfficeInterviewRecord(recordUserFlowId);
    expect(beforeDecision.rounds[1].averageScore).toBe(85);
    expect(beforeDecision.rounds[1].decision).toBeNull();

    const closed = await closeOfficeRoundTwo(
      recordFlowId,
      [{ userFlowId: recordUserFlowId, passed: true }],
      [recordUserFlowId],
      true,
    );
    /* 集成环境无邮件服务：名单已确认但发布失败，审计留档仍应写入 */
    expect(closed.success).toBe(false);

    const record = await getOfficeInterviewRecord(recordUserFlowId);
    /* 参评面试官：本人（session.uid）与他人区分 */
    expect(record.rounds[1].evaluations.map((evaluation) => evaluation.isMine)).toEqual([
      false,
      true,
    ]);
    expect(record.rounds[1].decision).toMatchObject({
      passed: true,
      decidedBy: "部长甲",
      evaluationCount: 2,
      averageScore: 85,
    });
  });

  it("补充候选人再次结束同一轮后，早前候选人的名单确认结论仍可查看", async () => {
    /* 撤回后重新报名会再次结束一面：新的审计快照只包含新候选人，
       早前候选人的确认结论必须从更早的快照里继续带出，而不是被最新一条清空 */
    const lateCandidateId = await insertCandidate(
      RECORD_CANDIDATE_ID + 60,
      1,
      recordFlowId,
      recordStepId,
      1,
      "publicity",
    );

    const closed = await closeOfficeRoundOne(
      recordFlowId,
      [{ userFlowId: lateCandidateId, passed: false }],
      [lateCandidateId],
      true,
    );
    expect(closed.success).toBe(true);

    const record = await getOfficeInterviewRecord(recordUserFlowId);
    expect(record.rounds[0].decision).toMatchObject({
      passed: true,
      decidedBy: "部长甲",
      evaluationCount: 2,
      averageScore: 89,
    });
  });

  it("非办公类流程没有全部面试记录", async () => {
    const [otherFlow] = await db
      .insert(flow)
      .values({
        title: "SMOKE-非办公类流程-记录",
        type: "recruitment_exemption",
        department: "publicity",
        ownerId: VIEWER_ID,
      })
      .returning({ id: flow.id });
    const [otherCandidate] = await db
      .insert(userFlow)
      .values({
        fkFlowId: otherFlow.id,
        fkUserId: RECORD_CANDIDATE_ID + 1,
        progressStatus: "ongoing",
        department: "publicity",
      })
      .returning({ id: userFlow.id });

    await expect(getOfficeInterviewRecord(otherCandidate.id)).rejects.toThrow(
      "只有办公类部门面试有全部面试记录",
    );
  });

  it("其他部门的候选人无法查看全部面试记录", async () => {
    await expect(getOfficeInterviewRecord(officeUserFlowId)).rejects.toThrow(
      "无权操作其他部门的候选人",
    );
    await expect(getOfficeInterviewRecord(recordSiblingUserFlowId)).rejects.toThrow(
      "无权操作其他部门的候选人",
    );
  });

  afterAll(async () => {
    /* 名单确认留档写在 operation_audit（无 flow 外键，不会被级联删除），这里自行收尾 */
    const smokeFlows = await db
      .select({ id: flow.id })
      .from(flow)
      .where(like(flow.title, "SMOKE-%"));
    const flowIds = smokeFlows.map((row) => row.id);
    if (flowIds.length === 0) return;
    await db
      .delete(operationAudit)
      .where(
        and(
          eq(operationAudit.resourceType, "flow"),
          inArray(operationAudit.resourceId, flowIds),
        ),
      );
  });
});

/* 改约申请只对「预约该日程的讲师」可见、可处理：管理员与其他讲师都看不到 */
describe("技术部门改约申请只对预约讲师可见", () => {
  const OTHER_LECTURER_ID = 900994;
  const TECH_CANDIDATE_ID = CANDIDATE_ID + 30;
  let techFlowId = 0;
  let techUserFlowId = 0;
  let requestId = 0;

  const otherLecturerSession = {
    uid: OTHER_LECTURER_ID,
    role: 2,
    name: "其他讲师",
    department: "publicity",
    scope: { kind: "department" as const, department: "publicity" },
  };

  beforeAll(async () => {
    const [techFlow] = await db
      .insert(flow)
      .values({
        title: "SMOKE-技术改约流程",
        type: "woc",
        department: "publicity",
        ownerId: VIEWER_ID,
      })
      .returning({ id: flow.id });
    techFlowId = techFlow.id;

    const [candidate] = await db
      .insert(userFlow)
      .values({
        fkFlowId: techFlowId,
        fkUserId: TECH_CANDIDATE_ID,
        progressStatus: "ongoing",
        department: "publicity",
      })
      .returning({ id: userFlow.id });
    techUserFlowId = candidate.id;

    /* 日程由 VIEWER_ID（本体 mock 会话）预约 */
    const [schedule] = await db
      .insert(interviewSchedule)
      .values({
        fkUserFlowId: techUserFlowId,
        fkOrganizerId: VIEWER_ID,
        startsAt: new Date(Date.now() + 60 * 60 * 1000),
        endsAt: new Date(Date.now() + 90 * 60 * 1000),
        summary: "SMOKE 改约申请日程",
        meetingLink: "https://vc.feishu.cn/j/smoke-slot-change",
        status: "created",
      })
      .returning({ id: interviewSchedule.id });

    const [request] = await db
      .insert(interviewSlotChangeRequest)
      .values({
        fkUserFlowId: techUserFlowId,
        fkInterviewScheduleId: schedule.id,
        requestedStartsAt: new Date(Date.now() + 26 * 60 * 60 * 1000),
        requestedEndsAt: new Date(Date.now() + 26.5 * 60 * 60 * 1000),
        reason: "课程冲突",
        fkRequestedBy: TECH_CANDIDATE_ID,
      })
      .returning({ id: interviewSlotChangeRequest.id });
    requestId = request.id;
  });

  it("其他讲师既看不到也无法处理", async () => {
    const { verifyScopedRole } = jest.requireMock("@/lib/authz") as {
      verifyScopedRole: jest.Mock;
    };

    verifyScopedRole.mockResolvedValueOnce(otherLecturerSession as never);
    const rows = await listPendingSlotChangeRequests();
    expect(rows.map((row) => row.id)).not.toContain(requestId);

    verifyScopedRole.mockResolvedValueOnce(otherLecturerSession as never);
    await expect(
      reviewInterviewSlotChange(requestId, false, { reviewNote: "暂不调整" }),
    ).rejects.toThrow("只能由预约的讲师处理该改约申请");
  });

  it("预约讲师可以看到并处理（暂不改期需填写说明）", async () => {
    const rows = await listPendingSlotChangeRequests();
    expect(rows.map((row) => row.id)).toContain(requestId);

    const result = await reviewInterviewSlotChange(requestId, false, {
      reviewNote: "近期时间已排满，请先按原时间参加",
    });
    expect(result.success).toBe(true);

    const [updated] = await db
      .select({
        status: interviewSlotChangeRequest.status,
        reviewNote: interviewSlotChangeRequest.reviewNote,
      })
      .from(interviewSlotChangeRequest)
      .where(eq(interviewSlotChangeRequest.id, requestId))
      .limit(1);
    expect(updated.status).toBe("rejected");
    expect(updated.reviewNote).toBe("近期时间已排满，请先按原时间参加");
  });
});

/* 最终去向的写入护栏：只能指向该候选人仍在进行或已通过的志愿部门 */
describe("最终去向只能写入未落选的志愿部门", () => {
  const DESTINATION_CANDIDATE_ID = CANDIDATE_ID + 70;
  let destinationFlowId = 0;
  let destinationUserFlowId = 0;
  let failedFlowId = 0;
  let failedUserFlowId = 0;

  beforeAll(async () => {
    const owned = await createOfficeFlow("SMOKE-最终去向-科宣部", "publicity");
    destinationFlowId = owned.flowId;
    const other = await createOfficeFlow("SMOKE-最终去向-办公室", "office");
    failedFlowId = other.flowId;

    destinationUserFlowId = await insertCandidate(
      DESTINATION_CANDIDATE_ID,
      2,
      destinationFlowId,
      null,
      1,
      "publicity",
    );
    failedUserFlowId = await insertCandidate(
      DESTINATION_CANDIDATE_ID,
      1,
      failedFlowId,
      null,
      2,
      "office",
    );
    /* 第二志愿已落选 */
    await db
      .update(userFlow)
      .set({ progressStatus: "failed" })
      .where(eq(userFlow.id, failedUserFlowId));
  });

  afterAll(async () => {
    /* 成功写入会留下审计（无外键），自行收尾 */
    await db
      .delete(operationAudit)
      .where(
        and(
          eq(operationAudit.resourceType, "user_flow"),
          inArray(operationAudit.resourceId, [destinationUserFlowId]),
        ),
      );
    await db
      .delete(userFlow)
      .where(inArray(userFlow.id, [destinationUserFlowId, failedUserFlowId]));
    await db
      .delete(flowStep)
      .where(inArray(flowStep.fkFlowId, [destinationFlowId, failedFlowId]));
    await db
      .delete(flow)
      .where(inArray(flow.id, [destinationFlowId, failedFlowId]));
  });

  it("已落选的志愿部门不能被设为最终去向", async () => {
    const result = await setOfficeFinalDestination(
      destinationUserFlowId,
      "office",
    );
    expect(result).toEqual({
      success: false,
      error: { message: "最终去向必须是该候选人仍在进行或已通过的志愿部门" },
    });

    const rows = await db
      .select({ finalDepartment: userFlow.finalDepartment })
      .from(userFlow)
      .where(
        inArray(userFlow.id, [destinationUserFlowId, failedUserFlowId]),
      );
    expect(rows.map((row) => row.finalDepartment)).toEqual([null, null]);
  });

  it("进行中的志愿部门可以设为最终去向并写到全部办公类报名", async () => {
    const result = await setOfficeFinalDestination(
      destinationUserFlowId,
      "publicity",
    );
    expect(result).toEqual({ success: true, department: "publicity" });

    const rows = await db
      .select({ finalDepartment: userFlow.finalDepartment })
      .from(userFlow)
      .where(
        inArray(userFlow.id, [destinationUserFlowId, failedUserFlowId]),
      );
    expect(rows.map((row) => row.finalDepartment)).toEqual([
      "publicity",
      "publicity",
    ]);
  });
});

/* 部长行内改时段：只对有面试流程的候选人开放，且不能因为脏入参把时段清空 */
describe("办公类改时段的参数与状态护栏", () => {
  const SLOT_CANDIDATE_ID = CANDIDATE_ID + 80;
  let slotFlowId = 0;
  let ongoingUserFlowId = 0;
  let finishedUserFlowId = 0;

  beforeAll(async () => {
    const owned = await createOfficeFlow("SMOKE-改时段-科宣部", "publicity");
    slotFlowId = owned.flowId;
    const roundOneStepId = owned.steps.find((step) => step.order === 2)?.id ?? null;

    ongoingUserFlowId = await insertCandidate(
      SLOT_CANDIDATE_ID,
      1,
      slotFlowId,
      roundOneStepId,
      1,
      "publicity",
    );
    finishedUserFlowId = await insertCandidate(
      SLOT_CANDIDATE_ID + 1,
      1,
      slotFlowId,
      roundOneStepId,
      2,
      "publicity",
    );
    await db
      .update(userFlow)
      .set({ progressStatus: "failed" })
      .where(eq(userFlow.id, finishedUserFlowId));
  });

  afterAll(async () => {
    await db
      .delete(operationAudit)
      .where(
        and(
          eq(operationAudit.resourceType, "user_flow"),
          inArray(operationAudit.resourceId, [
            ongoingUserFlowId,
            finishedUserFlowId,
          ]),
        ),
      );
    await db
      .delete(userFlow)
      .where(inArray(userFlow.id, [ongoingUserFlowId, finishedUserFlowId]));
    await db.delete(flowStep).where(eq(flowStep.fkFlowId, slotFlowId));
    await db.delete(flow).where(eq(flow.id, slotFlowId));
  });

  it("非字符串入参被拒绝，不会静默清空候选人的时段", async () => {
    await expect(
      updateCandidateInterviewSlot(
        ongoingUserFlowId,
        undefined as unknown as string,
      ),
    ).resolves.toEqual({
      success: false,
      error: { message: "面试时段参数无效" },
    });

    const [row] = await db
      .select({ slot: userFlow.interviewSlot })
      .from(userFlow)
      .where(eq(userFlow.id, ongoingUserFlowId))
      .limit(1);
    expect(row.slot).toBe("13:00-14:00");
  });

  it("报名已结束的候选人不能再改时段", async () => {
    await expect(
      updateCandidateInterviewSlot(finishedUserFlowId, "15:00-16:00"),
    ).resolves.toEqual({
      success: false,
      error: { message: "该候选人的报名已结束，不能再调整面试时段" },
    });
  });

  it("进行中的候选人可以改到流程配置内的时段并留档", async () => {
    await expect(
      updateCandidateInterviewSlot(ongoingUserFlowId, "15:00-16:00"),
    ).resolves.toEqual({ success: true, slot: "15:00-16:00" });

    const [row] = await db
      .select({ slot: userFlow.interviewSlot })
      .from(userFlow)
      .where(eq(userFlow.id, ongoingUserFlowId))
      .limit(1);
    expect(row.slot).toBe("15:00-16:00");

    const audits = await db
      .select({ action: operationAudit.action })
      .from(operationAudit)
      .where(
        and(
          eq(operationAudit.resourceType, "user_flow"),
          eq(operationAudit.resourceId, ongoingUserFlowId),
        ),
      );
    expect(audits.map((audit) => audit.action)).toContain(
      "user_flow.interview_slot.update",
    );
  });
});
