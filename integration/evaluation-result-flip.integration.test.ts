/** @jest-environment node */

/**
 * 已归档面评的结果改判：
 * - 流程结果未发布时，部长/管理员可以把已通过改判为不通过（或反向），候选人状态同步改判并写审计；
 * - 流程结果已发布/正在发布时锁定，面评与候选人状态都不再改动；
 * - 候选人已撤回时审批改判不能把撤回的报名复活。
 */

jest.mock("next/cache", () => ({
  revalidatePath: jest.fn(),
  revalidateTag: jest.fn(),
  unstable_cache: (fn: unknown) => fn,
}));

jest.mock("@/lib/operation-audit", () => ({
  writeOperationAudit: jest.fn(async () => undefined),
}));

jest.mock("@/lib/server-error-log", () => ({
  logServerError: jest.fn(),
}));

jest.mock("@/lib/authz", () => {
  const actual = jest.requireActual("@/lib/authz");
  const session = {
    uid: 900981,
    role: 3,
    department: "software",
    scope: { kind: "department", department: "software" },
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
  flowResultPublication,
  flowStep,
  interviewEvaluation,
  userFlow,
} from "@/db/schema";
import { eq, inArray, like } from "drizzle-orm";
import {
  approveEvaluation,
  rejectEvaluation,
} from "@/action/user-flow/evaluation";

const OWNER_ID = 900981;
const CANDIDATE_ID = 900982;
const AUTHOR_ID = 900983;
const TITLE_PREFIX = "SMOKEFLIP-";

let flowId = 0;
let finishedStepId = 0;
let candidateUserFlowId = 0;
let evaluationId = 0;

const readEvaluation = async (id: number) => {
  const [row] = await db
    .select({
      status: interviewEvaluation.status,
      reviewedBy: interviewEvaluation.fkReviewedBy,
    })
    .from(interviewEvaluation)
    .where(eq(interviewEvaluation.id, id))
    .limit(1);
  return row;
};

const readCandidate = async (id: number) => {
  const [row] = await db
    .select({
      status: userFlow.progressStatus,
      stepId: userFlow.fkCurrentStepId,
    })
    .from(userFlow)
    .where(eq(userFlow.id, id))
    .limit(1);
  return row;
};

beforeAll(async () => {
  const [created] = await db
    .insert(flow)
    .values({
      title: `${TITLE_PREFIX}2026 校科协软件研发部 免试招新`,
      type: "recruitment_exemption",
      department: "software",
      ownerId: OWNER_ID,
    })
    .returning({ id: flow.id });
  flowId = created.id;

  const steps = await db
    .insert(flowStep)
    .values([
      { title: "报名", type: "registering" as const, order: 1, fkFlowId: flowId },
      { title: "讲师审核", type: "checking" as const, order: 2, fkFlowId: flowId },
      { title: "管理员审核", type: "finished" as const, order: 3, fkFlowId: flowId },
    ])
    .returning({ id: flowStep.id, order: flowStep.order });
  finishedStepId = steps.find((step) => step.order === 3)?.id ?? 0;

  const [candidate] = await db
    .insert(userFlow)
    .values({
      fkFlowId: flowId,
      fkUserId: CANDIDATE_ID,
      fkCurrentStepId: steps.find((step) => step.order === 2)?.id ?? null,
      progressStatus: "ongoing",
      department: "software",
    })
    .returning({ id: userFlow.id });
  candidateUserFlowId = candidate.id;

  const [evaluation] = await db
    .insert(interviewEvaluation)
    .values({
      fkUserFlowId: candidateUserFlowId,
      fkUserId: AUTHOR_ID,
      content: "候选人基础扎实，沟通表达清晰，建议通过并进入下一阶段考核。",
      recommendation: "passed",
      status: "submitted",
    })
    .returning({ id: interviewEvaluation.id });
  evaluationId = evaluation.id;
});

afterAll(async () => {
  const created = await db
    .select({ id: flow.id })
    .from(flow)
    .where(like(flow.title, `${TITLE_PREFIX}%`));
  const flowIds = created.map((row) => row.id);
  if (flowIds.length === 0) return;

  const candidates = await db
    .select({ id: userFlow.id })
    .from(userFlow)
    .where(inArray(userFlow.fkFlowId, flowIds));
  const userFlowIds = candidates.map((row) => row.id);
  await db
    .delete(flowResultPublication)
    .where(inArray(flowResultPublication.fkFlowId, flowIds));
  await db
    .delete(interviewEvaluation)
    .where(inArray(interviewEvaluation.fkUserFlowId, userFlowIds));
  await db.delete(userFlow).where(inArray(userFlow.id, userFlowIds));
  await db.delete(flowStep).where(inArray(flowStep.fkFlowId, flowIds));
  await db.delete(flow).where(inArray(flow.id, flowIds));
});

describe("已归档面评的结果改判", () => {
  it("流程未发布时允许在已通过/不通过之间改判并写审计", async () => {
    const auditMock = jest.requireMock("@/lib/operation-audit")
      .writeOperationAudit as jest.Mock;

    await approveEvaluation(evaluationId);
    expect(await readEvaluation(evaluationId)).toMatchObject({
      status: "approved",
      reviewedBy: OWNER_ID,
    });
    expect(await readCandidate(candidateUserFlowId)).toMatchObject({
      status: "passed",
      stepId: finishedStepId,
    });

    /* 已通过 → 改为不通过 */
    await rejectEvaluation(evaluationId);
    expect(await readEvaluation(evaluationId)).toMatchObject({
      status: "rejected",
    });
    expect(await readCandidate(candidateUserFlowId)).toMatchObject({
      status: "failed",
    });
    expect(auditMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "evaluation.reject",
        resourceId: evaluationId,
      }),
    );

    /* 不通过 → 再改回通过 */
    await approveEvaluation(evaluationId);
    expect(await readEvaluation(evaluationId)).toMatchObject({
      status: "approved",
    });
    expect(await readCandidate(candidateUserFlowId)).toMatchObject({
      status: "passed",
      stepId: finishedStepId,
    });
    expect(auditMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "evaluation.approve",
        resourceId: evaluationId,
      }),
    );
  });

  it("流程结果发布后面评与候选人状态锁定", async () => {
    await db.insert(flowResultPublication).values({
      fkFlowId: flowId,
      status: "published",
      resultSnapshot: { flowId, rows: [] },
      templateSnapshot: { accepted: null, rejected: null },
      publishedAt: new Date(),
    });

    await expect(rejectEvaluation(evaluationId)).rejects.toThrow("锁定");
    expect(await readEvaluation(evaluationId)).toMatchObject({
      status: "approved",
    });
    expect(await readCandidate(candidateUserFlowId)).toMatchObject({
      status: "passed",
    });

    await db
      .delete(flowResultPublication)
      .where(eq(flowResultPublication.fkFlowId, flowId));
  });

  it("候选人已撤回时审批改判不会把他复活", async () => {
    await db
      .update(userFlow)
      .set({ progressStatus: "withdrawn" })
      .where(eq(userFlow.id, candidateUserFlowId));

    await expect(rejectEvaluation(evaluationId)).rejects.toThrow("已撤回");
    expect(await readEvaluation(evaluationId)).toMatchObject({
      status: "approved",
    });
    expect(await readCandidate(candidateUserFlowId)).toMatchObject({
      status: "withdrawn",
    });
  });
});
