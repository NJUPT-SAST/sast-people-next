"use server";

import { db } from "@/db/drizzle";
import {
  flow,
  flowResultPublication,
  flowStep,
  interviewEvaluation,
  interviewSchedule,
  userFlow,
} from "@/db/schema";
import {
  canApproveEvaluation,
  canReturnEvaluation,
  canRejectEvaluation,
  dedupeEvaluationCandidateRows,
  evaluationStepTypeForAction,
  type EvaluationFlowStepType,
} from "@/lib/evaluation-state";
import { departmentScopeFilter, verifyManager, verifyScopedRole } from "@/lib/authz";
import type { FlowScopedSession } from "@/action/flow/department-utils";
import { assertUserFlowAccess } from "@/lib/flow-access";
import {
  loadFeishuApprovalNotificationRecord,
  sendFeishuApprovalCard,
} from "@/lib/feishu/approval-notification";
import { listPeopleUsersByLinkIds } from "@/lib/link/user-lookup";
import { writeOperationAudit } from "@/lib/operation-audit";
import { logServerError } from "@/lib/server-error-log";
import { and, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getFeishuOAuthAccountStatus } from "@/lib/feishu/oauth-account";
import { sendInterviewEvaluationReturnedCard } from "@/lib/feishu/interview-message";
import { MIN_PASSED_EVALUATION_LENGTH } from "@/lib/evaluation-constants";
import { isOfficeInterviewFlow, OFFICE_INTERVIEW_FLOW_TYPE } from "@/const/flow";
import { MANAGER_ROLE } from "@/lib/link/role";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type EvaluationRecommendation = "passed" | "failed";

/* 办公类面试必须打分，管理员终审驳回同样沿用这条文案 */
const INVALID_SCORE_MESSAGE = "请填写 0-100 的面试分数";
const RESULT_LOCKED_MESSAGE = "该候选人结果已确认，不能再修改";
/* 办公类部门没有讲师这一级：候选人列表与面评提交都只对部长开放 */
const OFFICE_MANAGER_ONLY_MESSAGE = "办公类部门面试由部长操作，讲师账号无法评分";
/* 办公类部门没有面评审批：结果由部长在名单确认时直接决定 */
const OFFICE_APPROVAL_UNSUPPORTED_MESSAGE =
  "办公类部门面试由部长在名单确认时决定，无需面评审批";

/* 办公类流程的固定步骤 order：一面面试=2、二轮面试=3（两个 checking 步骤无法按
   type 区分，只能按 order 精确定位）；二面之后候选人由名单确认（closeOfficeRound*）推进 */

function isEvaluationRecommendation(
  value: string,
): value is EvaluationRecommendation {
  return value === "passed" || value === "failed";
}

/**
 * 面评操作的访问判定依据：报名归属部门（技术部门共享流程依赖组别映射到部门；
 * 办公类流程每条流程归属一个办公部门，同样按报名归属部门收敛）。
 */
function userFlowAccessTarget(ref: {
  department: string | null | undefined;
  flowType: string | null | undefined;
}) {
  return { type: ref.flowType, department: ref.department };
}

/** Prefer step type; fall back to historical order for older customized flows. */
async function findEvaluationStepIdInTx(
  tx: Tx,
  flowId: number,
  stepType: EvaluationFlowStepType,
): Promise<number | null> {
  const [byType] = await tx
    .select({ id: flowStep.id })
    .from(flowStep)
    .where(
      and(
        eq(flowStep.fkFlowId, flowId),
        eq(flowStep.type, stepType),
      ),
    )
    .orderBy(desc(flowStep.order))
    .limit(1);

  if (byType) return byType.id;

  const fallbackOrder = stepType === "checking" ? 2 : 3;
  const [byOrder] = await tx
    .select({ id: flowStep.id })
    .from(flowStep)
    .where(
      and(
        eq(flowStep.fkFlowId, flowId),
        eq(flowStep.order, fallbackOrder),
      ),
    )
    .limit(1);

  return byOrder?.id ?? null;
}

/** 按 order 精确定位流程步骤：办公类流程有两个 checking 步骤，只能按 order 区分 */
async function findFlowStepIdByOrderInTx(
  tx: Tx,
  flowId: number,
  order: number,
): Promise<number | null> {
  const [step] = await tx
    .select({ id: flowStep.id })
    .from(flowStep)
    .where(and(eq(flowStep.fkFlowId, flowId), eq(flowStep.order, order)))
    .limit(1);

  return step?.id ?? null;
}

async function findActiveEvaluationInTx(tx: Tx, userFlowId: number) {
  const selectByStatus = (status: "approved" | "submitted" | "returned") =>
    tx
      .select({
        id: interviewEvaluation.id,
        status: interviewEvaluation.status,
        meetingLink: interviewEvaluation.meetingLink,
        authorId: interviewEvaluation.fkUserId,
      })
      .from(interviewEvaluation)
      .where(
        and(
          eq(interviewEvaluation.fkUserFlowId, userFlowId),
          eq(interviewEvaluation.status, status),
        ),
      )
      .orderBy(desc(interviewEvaluation.id))
      .limit(1);

  const [approved] = await selectByStatus("approved");
  if (approved) return approved;

  const [submitted] = await selectByStatus("submitted");
  if (submitted) return submitted;
  const [returned] = await selectByStatus("returned");
  return returned ?? null;
}

/** 步骤定位：按类型（其他流程）或按 order（办公类流程，两个 checking 步骤） */
type EvaluationStepTarget =
  | { type: EvaluationFlowStepType }
  | { order: number };

async function moveUserFlowInTx(
  tx: Tx,
  userFlowId: number,
  progressStatus: "ongoing" | "passed" | "failed",
  step: EvaluationStepTarget,
  round?: number,
) {
  const [uf] = await tx
    .select({ flowId: userFlow.fkFlowId })
    .from(userFlow)
    .where(eq(userFlow.id, userFlowId))
    .limit(1);

  if (uf) {
    const [publication] = await tx
      .select({ status: flowResultPublication.status })
      .from(flowResultPublication)
      .where(eq(flowResultPublication.fkFlowId, uf.flowId))
      .limit(1);
    if (publication?.status === "published" || publication?.status === "publishing") {
      throw new Error("该流程结果正在发布或已经发布，名单和结果已锁定");
    }
  }

  const stepId = uf
    ? "order" in step
      ? await findFlowStepIdByOrderInTx(tx, uf.flowId, step.order)
      : await findEvaluationStepIdInTx(tx, uf.flowId, step.type)
    : null;

  await tx
    .update(userFlow)
    .set({
      progressStatus,
      fkCurrentStepId: stepId,
      /* 办公类面试推进候选人当前轮次；其他流程保持原值（NULL） */
      ...(round === undefined ? {} : { round }),
      updatedAt: new Date(),
    })
    .where(eq(userFlow.id, userFlowId));

  return uf?.flowId ?? null;
}

async function linkEvaluationToActiveScheduleInTx(
  tx: Tx,
  userFlowId: number,
  evaluationId: number,
) {
  await tx
    .update(interviewSchedule)
    .set({ fkEvaluationId: evaluationId, updatedAt: new Date() })
    .where(
      and(
        eq(interviewSchedule.fkUserFlowId, userFlowId),
        eq(interviewSchedule.status, "created"),
      ),
    );
}

async function notifyFeishuApprovalGroup(evaluationId: number): Promise<void> {
  const chatId = process.env.FEISHU_APPROVAL_CHAT_ID?.trim();
  if (!chatId) return;

  const record = await loadFeishuApprovalNotificationRecord(evaluationId);
  if (!record) return;

  const userMap = await listPeopleUsersByLinkIds(
    [record.candidateId, record.authorId],
    { canViewSensitiveInfo: true },
  );
  const candidate = userMap.get(record.candidateId);
  const author = userMap.get(record.authorId);

  const result = await sendFeishuApprovalCard({
    chatId,
    context: {
      evaluationId: record.evaluationId,
      messageId: record.messageId,
      candidateName: candidate?.name ?? "同学",
      candidateStudentId: candidate?.studentId ?? null,
      authorName: author?.name ?? "讲师",
      flowTitle: record.flowTitle,
      flowType: record.flowType,
      recommendation: record.recommendation,
      content: record.content,
      portfolioDescription: record.portfolioDescription,
      portfolioLink: record.portfolioLink,
      meetingLink: record.meetingLink,
      minuteLink: record.minuteLink,
      submittedAt: record.submittedAt,
      updatedAt: record.updatedAt,
    },
  });

  await db
    .update(interviewEvaluation)
    .set({ feishuApprovalMessageId: result.messageId, updatedAt: new Date() })
    .where(eq(interviewEvaluation.id, evaluationId));

}

async function safeNotifyFeishuApprovalGroup(
  evaluationId: number,
  session: Pick<FlowScopedSession, "uid" | "role">,
) {
  try {
    return await notifyFeishuApprovalGroup(evaluationId);
  } catch (error) {
    logServerError("evaluation:approval-notification", error, {
      path: "/dashboard/interviews",
      userId: session.uid,
      role: session.role,
      action: "notify-feishu-approval-group",
      metadata: { evaluationId },
    });
    return null;
  }
}

export const createEvaluation = async (
  userFlowId: number,
  content: string,
  /* 讲师建议（技术流程必填）；办公类面试可选填「面试意见」，仅供参考，不参与结果判定 */
  recommendation?: EvaluationRecommendation | null,
  meetingLink?: string,
  score?: number,
) => {
  let session: FlowScopedSession | null = null;

  try {
    session = await verifyScopedRole(2);

    // 面评只能写给有权限的候选人：报名归属部门与当前 scope 一致（管理员放行）。
    // 必填项随流程类型不同，所以流程类型必须先读出来。
    const [scopeTarget] = await db
      .select({
        department: userFlow.department,
        flowType: flow.type,
      })
      .from(userFlow)
      .innerJoin(flow, eq(userFlow.fkFlowId, flow.id))
      .where(eq(userFlow.id, userFlowId))
      .limit(1);
    if (scopeTarget) {
      assertUserFlowAccess(session.scope, userFlowAccessTarget(scopeTarget));
    }
    const isOfficeFlow = isOfficeInterviewFlow(scopeTarget?.flowType ?? "");
    /* 办公类部门没有讲师这一级：面评只能由部长提交（技术部门仍由预约讲师填写） */
    if (isOfficeFlow && session.role < MANAGER_ROLE) {
      throw new Error(OFFICE_MANAGER_ONLY_MESSAGE);
    }

    if (!content.trim()) {
      return {
        success: false,
        error: {
          message: isOfficeFlow ? "面试记录内容不能为空" : "面评内容不能为空",
        },
      };
    }

    /* 办公类面试：内容 + 分数是结果判定依据，建议通过/建议不通过只作留档意见（可选） */
    const normalizedRecommendation: EvaluationRecommendation | null =
      recommendation && isEvaluationRecommendation(recommendation)
        ? recommendation
        : null;
    if (!isOfficeFlow) {
      if (!normalizedRecommendation) {
        return { success: false, error: { message: "请选择讲师建议" } };
      }
      if (
        normalizedRecommendation === "passed" &&
        content.trim().length < MIN_PASSED_EVALUATION_LENGTH
      ) {
        return {
          success: false,
          error: {
            message: `建议通过时，面评内容至少需要 ${MIN_PASSED_EVALUATION_LENGTH} 个字。`,
          },
        };
      }
    }

    /* 办公类分数必填（均分是名单确认的唯一依据）；技术流程分数可选，但给了就得合法 */
    const hasScoreArg = score !== undefined;
    const scoreIsValid =
      score !== undefined &&
      Number.isInteger(score) &&
      score >= 0 &&
      score <= 100;
    if ((isOfficeFlow || hasScoreArg) && !scoreIsValid) {
      return { success: false, error: { message: INVALID_SCORE_MESSAGE } };
    }

    /* 办公类不使用会议/妙记链接 */
    const hasMeetingLinkArg = !isOfficeFlow && meetingLink !== undefined;
    const link = meetingLink !== undefined ? meetingLink.trim() || null : undefined;

    const result = await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(${userFlowId})`);
      const [currentFlow] = await tx
        .select({
          progressStatus: userFlow.progressStatus,
          round: userFlow.round,
          flowType: flow.type,
        })
        .from(userFlow)
        .innerJoin(flow, eq(userFlow.fkFlowId, flow.id))
        .where(eq(userFlow.id, userFlowId))
        .limit(1);

      if (!currentFlow) {
        return {
          success: false as const,
          error: { message: "报名流程不存在" },
        };
      }
      if (currentFlow.progressStatus === "passed") {
        return {
          success: false as const,
          error: {
            message: "该候选人流程已结束；如需调整成员权限，请在成员管理中操作",
          },
        };
      }
      if (currentFlow.progressStatus === "failed") {
        return {
          success: false as const,
          error: {
            message: "该候选人流程已结束；如需重新评估，请重新报名并完整走流程",
          },
        };
      }

      const active = await findActiveEvaluationInTx(tx, userFlowId);

      if (active?.status === "approved") {
        return {
          success: false as const,
          error: {
            message: "该候选人面评已归档；如需调整成员权限，请在成员管理中操作",
          },
        };
      }

      // 办公类面试：无需面试日程，多位部长各写一份带分数的面试记录。
      // 每位面评人只维护自己那一份，绝不改动他人的记录。
      if (isOfficeInterviewFlow(currentFlow.flowType)) {
        const [own] = await tx
          .select({ id: interviewEvaluation.id })
          .from(interviewEvaluation)
          .where(
            and(
              eq(interviewEvaluation.fkUserFlowId, userFlowId),
              eq(interviewEvaluation.fkUserId, session!.uid),
              inArray(interviewEvaluation.status, ["submitted", "returned"]),
            ),
          )
          .orderBy(desc(interviewEvaluation.id))
          .limit(1);

        await moveUserFlowInTx(
          tx,
          userFlowId,
          "ongoing",
          /* 办公类面试：提交记录只回到候选人当前阶段（一面/二轮面试），等待名单确认 */
          { order: (currentFlow.round ?? 1) >= 2 ? 3 : 2 },
        );

        if (own) {
          await tx
            .update(interviewEvaluation)
            .set({
              content: content.trim(),
              /* 办公类留档：分数 + 记录内容 + 可选意见（不含会议/妙记链接） */
              recommendation: normalizedRecommendation,
              meetingLink: null,
              score: score ?? null,
              /* 办公类面试按候选人当前阶段记录轮次 */
              round: currentFlow.round ?? 1,
              status: "submitted",
              fkReviewedBy: null,
              returnReason: null,
              updatedAt: new Date(),
            })
            .where(eq(interviewEvaluation.id, own.id));

          return {
            success: true as const,
            data: { id: own.id },
            auditAction: "evaluation.update_pending" as const,
            evaluationId: own.id,
          };
        }

        const [evaluation] = await tx
          .insert(interviewEvaluation)
          .values({
            fkUserFlowId: userFlowId,
            fkUserId: session!.uid,
            content: content.trim(),
            meetingLink: null,
            recommendation: normalizedRecommendation,
            score: score ?? null,
            /* 办公类面试按候选人当前阶段记录轮次 */
            round: currentFlow.round ?? 1,
            status: "submitted",
          })
          .returning();

        return {
          success: true as const,
          data: evaluation,
          auditAction: "evaluation.create" as const,
          evaluationId: evaluation.id,
        };
      }

      if (!active) {
        const [rejected] = await tx
          .select({ id: interviewEvaluation.id })
          .from(interviewEvaluation)
          .where(
            and(
              eq(interviewEvaluation.fkUserFlowId, userFlowId),
              eq(interviewEvaluation.status, "rejected"),
            ),
          )
          .orderBy(desc(interviewEvaluation.id))
          .limit(1);

        if (rejected) {
          return {
            success: false as const,
            error: {
              message: "该候选人面评已归档；如需重新评估，请重新报名并完整走流程",
            },
          };
        }
        const [activeSchedule] = await tx
          .select({
            meetingStatus: interviewSchedule.meetingStatus,
            organizerId: interviewSchedule.fkOrganizerId,
          })
          .from(interviewSchedule)
          .where(
            and(
              eq(interviewSchedule.fkUserFlowId, userFlowId),
              eq(interviewSchedule.status, "created"),
            ),
          )
          .orderBy(desc(interviewSchedule.startsAt))
          .limit(1);

        if (!activeSchedule) {
          return {
            success: false as const,
            error: { message: "请先创建面试日程并确认结束后再提交面评" },
          };
        }

        if (activeSchedule.organizerId !== session!.uid) {
          return {
            success: false as const,
            error: { message: "只能由预约讲师提交该候选人的面评" },
          };
        }

        if (activeSchedule.meetingStatus !== "ended") {
          return {
            success: false as const,
            error: { message: "请先确认面试结束后再提交面评" },
          };
        }
      }

      if (active?.status === "submitted" || active?.status === "returned") {
        const [activeSchedule] = await tx
          .select({ organizerId: interviewSchedule.fkOrganizerId })
          .from(interviewSchedule)
          .where(
            and(
              eq(interviewSchedule.fkUserFlowId, userFlowId),
              eq(interviewSchedule.status, "created"),
            ),
          )
          .orderBy(desc(interviewSchedule.startsAt))
          .limit(1);

        if (
          !activeSchedule ||
          activeSchedule.organizerId !== session!.uid ||
          active.authorId !== session!.uid
        ) {
          return {
            success: false as const,
            error: { message: "只能由预约讲师修改待审核面评" },
          };
        }
      }

      await moveUserFlowInTx(
        tx,
        userFlowId,
        "ongoing",
        { type: evaluationStepTypeForAction("submit_for_review") },
      );

      if (active?.status === "submitted" || active?.status === "returned") {
        await tx
          .update(interviewEvaluation)
          .set({
            content: content.trim(),
            recommendation: normalizedRecommendation,
            ...(hasScoreArg ? { score } : {}),
            status: "submitted",
            fkReviewedBy: null,
            returnReason: null,
            ...(hasMeetingLinkArg ? { meetingLink: link ?? null } : {}),
            updatedAt: new Date(),
          })
          .where(eq(interviewEvaluation.id, active.id));

        await linkEvaluationToActiveScheduleInTx(tx, userFlowId, active.id);

        return {
          success: true as const,
          data: { id: active.id },
          auditAction: "evaluation.update_pending" as const,
          evaluationId: active.id,
        };
      }

      const [evaluation] = await tx
        .insert(interviewEvaluation)
        .values({
          fkUserFlowId: userFlowId,
          fkUserId: session!.uid,
          content: content.trim(),
          meetingLink: link ?? null,
          recommendation: normalizedRecommendation,
          score: score ?? null,
          status: "submitted",
        })
        .returning();

      await linkEvaluationToActiveScheduleInTx(tx, userFlowId, evaluation.id);

      return {
        success: true as const,
        data: evaluation,
        auditAction: "evaluation.create" as const,
        evaluationId: evaluation.id,
      };
    });

    if (!result.success) {
      return result;
    }

    revalidatePath("/dashboard/interviews");
    revalidatePath("/dashboard/approvals");
    await writeOperationAudit({
      actorId: session.uid,
      actorRole: session.role,
      action: result.auditAction,
      resourceType: "interview_evaluation",
      resourceId: result.evaluationId,
      department: scopeTarget?.department ?? null,
      metadata: {
        userFlowId,
        hasMeetingLink: hasMeetingLinkArg ? Boolean(link) : undefined,
        recommendation: normalizedRecommendation,
        ...(hasScoreArg ? { score } : {}),
      },
    });

    /* 办公类面试没有面评审批：提交即留档，不推审批飞书卡片 */
    if (!isOfficeFlow) {
      await safeNotifyFeishuApprovalGroup(result.evaluationId, session);
    }

    return { success: true, data: result.data };
  } catch (error) {
    logServerError("evaluation:create", error, {
      path: "/dashboard/interviews",
      userId: session?.uid ?? null,
      role: session?.role ?? null,
      action: "create-evaluation",
      userFlowId,
      metadata: { hasMeetingLink: Boolean(meetingLink?.trim()), recommendation },
    });
    throw error;
  }
};

export const approveEvaluation = async (evaluationId: number) => {
  let session: FlowScopedSession | null = null;
  let affectedUserId: number | null = null;
  let targetDepartment: string | null = null;

  try {
    session = await verifyManager();

    await db.transaction(async (tx) => {
      const [evalRecord] = await tx
        .select({
          fkUserFlowId: interviewEvaluation.fkUserFlowId,
          status: interviewEvaluation.status,
          content: interviewEvaluation.content,
          recommendation: interviewEvaluation.recommendation,
        })
        .from(interviewEvaluation)
        .where(eq(interviewEvaluation.id, evaluationId))
        .for("update")
        .limit(1);

      if (!evalRecord) throw new Error("面评不存在");

      const [uf] = await tx
        .select({
          fkUserId: userFlow.fkUserId,
          department: userFlow.department,
          progressStatus: userFlow.progressStatus,
          flowType: flow.type,
        })
        .from(userFlow)
        .innerJoin(flow, eq(userFlow.fkFlowId, flow.id))
        .where(eq(userFlow.id, evalRecord.fkUserFlowId))
        .limit(1);

      // 只能审批本部门候选人的面评
      assertUserFlowAccess(
        session!.scope,
        userFlowAccessTarget({
          department: uf?.department,
          flowType: uf?.flowType,
        }),
      );
      targetDepartment = uf?.department ?? null;

      /* 办公类部门面试没有面评审批：结果由部长在名单确认时直接决定 */
      if (isOfficeInterviewFlow(uf?.flowType ?? "")) {
        throw new Error(OFFICE_APPROVAL_UNSUPPORTED_MESSAGE);
      }

      // 候选人的结果已经落定，任何面评都不再改动其状态
      if (
        uf?.progressStatus === "passed" ||
        uf?.progressStatus === "failed" ||
        uf?.progressStatus === "withdrawn"
      ) {
        throw new Error(RESULT_LOCKED_MESSAGE);
      }

      if (!canApproveEvaluation(evalRecord.status)) {
        throw new Error("只能通过待终审的面评");
      }
      if (
        evalRecord.recommendation === "passed" &&
        evalRecord.content.trim().length < MIN_PASSED_EVALUATION_LENGTH
      ) {
        throw new Error(
          `建议通过时，面评内容至少需要 ${MIN_PASSED_EVALUATION_LENGTH} 个字，请先退回重写。`,
        );
      }

      await tx
        .update(interviewEvaluation)
        .set({
          status: "approved",
          fkReviewedBy: session!.uid,
          updatedAt: new Date(),
        })
        .where(eq(interviewEvaluation.id, evaluationId));

      if (uf) {
        affectedUserId = uf.fkUserId;
        await moveUserFlowInTx(
          tx,
          evalRecord.fkUserFlowId,
          "passed",
          { type: evaluationStepTypeForAction("admin_decision") },
        );
      }
    });

    revalidatePath("/dashboard/approvals");
    revalidatePath("/dashboard/interviews");
    await writeOperationAudit({
      actorId: session.uid,
      actorRole: session.role,
      action: "evaluation.approve",
      resourceType: "interview_evaluation",
      resourceId: evaluationId,
      department: targetDepartment,
      metadata: { affectedUserId },
    });
  } catch (error) {
    logServerError("evaluation:approve", error, {
      path: "/dashboard/approvals",
      userId: session?.uid ?? null,
      role: session?.role ?? null,
      action: "approve-evaluation",
      metadata: { evaluationId, affectedUserId },
    });
    throw error;
  }
};

export const rejectEvaluation = async (evaluationId: number) => {
  let session: FlowScopedSession | null = null;
  let targetDepartment: string | null = null;

  try {
    session = await verifyManager();

    await db.transaction(async (tx) => {
      const [evalRecord] = await tx
        .select({
          fkUserFlowId: interviewEvaluation.fkUserFlowId,
          status: interviewEvaluation.status,
        })
        .from(interviewEvaluation)
        .where(eq(interviewEvaluation.id, evaluationId))
        .for("update")
        .limit(1);

      if (!evalRecord) throw new Error("面评不存在");

      const [uf] = await tx
        .select({
          department: userFlow.department,
          progressStatus: userFlow.progressStatus,
          flowType: flow.type,
        })
        .from(userFlow)
        .innerJoin(flow, eq(userFlow.fkFlowId, flow.id))
        .where(eq(userFlow.id, evalRecord.fkUserFlowId))
        .limit(1);

      // 只能判定本部门候选人的面评
      assertUserFlowAccess(
        session!.scope,
        userFlowAccessTarget({
          department: uf?.department,
          flowType: uf?.flowType,
        }),
      );
      targetDepartment = uf?.department ?? null;

      /* 办公类部门面试没有面评审批：结果由部长在名单确认时直接决定 */
      if (isOfficeInterviewFlow(uf?.flowType ?? "")) {
        throw new Error(OFFICE_APPROVAL_UNSUPPORTED_MESSAGE);
      }

      // 候选人的结果已经落定，任何面评都不再改动其状态
      if (
        uf?.progressStatus === "passed" ||
        uf?.progressStatus === "failed" ||
        uf?.progressStatus === "withdrawn"
      ) {
        throw new Error(RESULT_LOCKED_MESSAGE);
      }

      if (!canRejectEvaluation(evalRecord.status)) {
        throw new Error("只能判定待终审的面评为不通过");
      }

      await tx
        .update(interviewEvaluation)
        .set({
          status: "rejected",
          fkReviewedBy: session!.uid,
          updatedAt: new Date(),
        })
        .where(eq(interviewEvaluation.id, evaluationId));

      await moveUserFlowInTx(
        tx,
        evalRecord.fkUserFlowId,
        "failed",
        { type: evaluationStepTypeForAction("admin_decision") },
      );
    });

    revalidatePath("/dashboard/approvals");
    revalidatePath("/dashboard/interviews");
    await writeOperationAudit({
      actorId: session.uid,
      actorRole: session.role,
      action: "evaluation.reject",
      resourceType: "interview_evaluation",
      resourceId: evaluationId,
      department: targetDepartment,
    });
  } catch (error) {
    logServerError("evaluation:reject", error, {
      path: "/dashboard/approvals",
      userId: session?.uid ?? null,
      role: session?.role ?? null,
      action: "reject-evaluation",
      metadata: { evaluationId },
    });
    throw error;
  }
};

export const returnEvaluation = async (evaluationId: number, reason: string) => {
  let session: FlowScopedSession | null = null;
  let targetDepartment: string | null = null;
  try {
    session = await verifyManager();
    const normalizedReason = reason.trim();
    if (!normalizedReason) throw new Error("请填写退回理由");

    const record = await db.transaction(async (tx) => {
      const [evaluation] = await tx
        .select({
          id: interviewEvaluation.id,
          status: interviewEvaluation.status,
          authorId: interviewEvaluation.fkUserId,
          userFlowId: interviewEvaluation.fkUserFlowId,
        })
        .from(interviewEvaluation)
        .where(eq(interviewEvaluation.id, evaluationId))
        .for("update")
        .limit(1);
      if (!evaluation) throw new Error("面评不存在");

      const [uf] = await tx
        .select({
          department: userFlow.department,
          flowType: flow.type,
        })
        .from(userFlow)
        .innerJoin(flow, eq(userFlow.fkFlowId, flow.id))
        .where(eq(userFlow.id, evaluation.userFlowId))
        .limit(1);

      // 只能退回本部门候选人的面评
      assertUserFlowAccess(
        session!.scope,
        userFlowAccessTarget({
          department: uf?.department,
          flowType: uf?.flowType,
        }),
      );
      targetDepartment = uf?.department ?? null;

      /* 办公类部门面试没有面评审批：结果由部长在名单确认时直接决定 */
      if (isOfficeInterviewFlow(uf?.flowType ?? "")) {
        throw new Error(OFFICE_APPROVAL_UNSUPPORTED_MESSAGE);
      }

      if (!canReturnEvaluation(evaluation.status)) throw new Error("只能退回待终审的面评");
      await tx.update(interviewEvaluation).set({
        status: "returned",
        returnReason: normalizedReason,
        fkReviewedBy: session!.uid,
        updatedAt: new Date(),
      }).where(eq(interviewEvaluation.id, evaluationId));
      await moveUserFlowInTx(tx, evaluation.userFlowId, "ongoing", { type: evaluationStepTypeForAction("submit_for_review") });
      return evaluation;
    });

    let notificationStatus: "sent" | "unavailable" | "failed" = "unavailable";
    try {
      const credential = await getFeishuOAuthAccountStatus(record.authorId);
      if (credential.bound && credential.providerUserId) {
        const [candidate] = await db.select({ name: flow.title }).from(flow).innerJoin(userFlow, eq(userFlow.fkFlowId, flow.id)).where(eq(userFlow.id, record.userFlowId)).limit(1);
        await sendInterviewEvaluationReturnedCard({ openId: credential.providerUserId, reason: normalizedReason, flowName: candidate?.name ?? "面试流程" });
        notificationStatus = "sent";
      }
    } catch (error) {
      notificationStatus = "failed";
      logServerError("evaluation:return:feishu", error, { path: "/dashboard/approvals", userId: session.uid, role: session.role, action: "notify-evaluation-returned", metadata: { evaluationId } });
    }
    revalidatePath("/dashboard/approvals");
    revalidatePath("/dashboard/interviews");
    await writeOperationAudit({ actorId: session.uid, actorRole: session.role, action: "evaluation.return", resourceType: "interview_evaluation", resourceId: evaluationId, department: targetDepartment, metadata: { reason: normalizedReason } });
    return {
      success: true as const,
      notificationSent: notificationStatus === "sent",
      notificationStatus,
    };
  } catch (error) {
    logServerError("evaluation:return", error, { path: "/dashboard/approvals", userId: session?.uid ?? null, role: session?.role ?? null, action: "return-evaluation", metadata: { evaluationId } });
    throw error;
  }
};


export const getAllEvaluations = async () => {
  let session: FlowScopedSession | null = null;

  try {
    session = await verifyManager();

    /* 审批列表按部门可见性收敛：不在范围内直接查不到 */
    const scopeFilter = departmentScopeFilter(userFlow.department, session.scope);

    /* 办公类面试没有面评审批：结果由部长在名单确认时决定，这类记录不进审批列表 */
    const rows = await db
      .select({
        evaluation: interviewEvaluation,
        meetingLink: interviewEvaluation.meetingLink,
        portfolioLink: userFlow.portfolioLink,
        portfolioDescription: userFlow.portfolioDescription,
        applyGroup: userFlow.applyGroup,
        department: userFlow.department,
        authorId: interviewEvaluation.fkUserId,
        candidateId: userFlow.fkUserId,
        flowTitle: flow.title,
        flowType: flow.type,
        publicationStatus: flowResultPublication.status,
      })
      .from(interviewEvaluation)
      .leftJoin(userFlow, eq(interviewEvaluation.fkUserFlowId, userFlow.id))
      .leftJoin(flow, eq(userFlow.fkFlowId, flow.id))
      .leftJoin(flowResultPublication, eq(flowResultPublication.fkFlowId, flow.id))
      .where(and(scopeFilter, ne(flow.type, OFFICE_INTERVIEW_FLOW_TYPE)))
      .orderBy(desc(interviewEvaluation.createdAt));

    const userFlowIds = rows
      .map((row) => row.evaluation.fkUserFlowId)
      .filter((id): id is number => id !== null);
    const schedules = userFlowIds.length === 0
      ? []
      : await db
          .select({
            evaluationId: interviewSchedule.fkEvaluationId,
            userFlowId: interviewSchedule.fkUserFlowId,
            scheduleMeetingLink: interviewSchedule.meetingLink,
            minuteLink: interviewSchedule.meetingMinuteLink,
            updatedAt: interviewSchedule.updatedAt,
          })
          .from(interviewSchedule)
          .where(inArray(interviewSchedule.fkUserFlowId, userFlowIds))
          .orderBy(desc(interviewSchedule.updatedAt));
    const minuteByEvaluation = new Map<number, string>();
    const minuteByUserFlow = new Map<number, string>();
    const meetingByEvaluation = new Map<number, string>();
    const meetingByUserFlow = new Map<number, string>();
    for (const schedule of schedules) {
      if (schedule.scheduleMeetingLink) {
        if (schedule.evaluationId && !meetingByEvaluation.has(schedule.evaluationId)) {
          meetingByEvaluation.set(schedule.evaluationId, schedule.scheduleMeetingLink);
        }
        if (!meetingByUserFlow.has(schedule.userFlowId)) {
          meetingByUserFlow.set(schedule.userFlowId, schedule.scheduleMeetingLink);
        }
      }
      if (schedule.minuteLink) {
        if (schedule.evaluationId && !minuteByEvaluation.has(schedule.evaluationId)) {
          minuteByEvaluation.set(schedule.evaluationId, schedule.minuteLink);
        }
        if (!minuteByUserFlow.has(schedule.userFlowId)) {
          minuteByUserFlow.set(schedule.userFlowId, schedule.minuteLink);
        }
      }
    }

    const userMap = await listPeopleUsersByLinkIds(
      rows
        .flatMap((row) => [
          row.authorId,
          row.candidateId,
          row.evaluation.fkReviewedBy,
        ])
        .filter((id): id is number => id !== null),
    );

    return rows.map((row) => ({
      ...row,
      meetingLink:
        row.meetingLink ??
        minuteByEvaluation.get(row.evaluation.id) ??
        minuteByUserFlow.get(row.evaluation.fkUserFlowId) ??
        null,
      meetingMinuteLink:
        row.meetingLink ??
        minuteByEvaluation.get(row.evaluation.id) ??
        minuteByUserFlow.get(row.evaluation.fkUserFlowId) ??
        null,
      scheduleMeetingLink:
        meetingByEvaluation.get(row.evaluation.id) ??
        meetingByUserFlow.get(row.evaluation.fkUserFlowId) ??
        null,
      authorName: userMap.get(row.authorId)?.name ?? null,
      reviewerName: row.evaluation.fkReviewedBy
        ? (userMap.get(row.evaluation.fkReviewedBy)?.name ?? null)
        : null,
      candidateId: row.candidateId ?? null,
      candidateName: row.candidateId
        ? (userMap.get(row.candidateId)?.name ?? null)
        : null,
      candidateStudentId: row.candidateId
        ? (userMap.get(row.candidateId)?.studentId ?? null)
        : null,
    }));
  } catch (error) {
    logServerError("evaluation:getAll", error, {
      path: "/dashboard/approvals",
      userId: session?.uid ?? null,
      role: session?.role ?? null,
      action: "get-all-evaluations",
    });
    throw error;
  }
};

export const getEvaluationCandidates = async (flowId: number) => {
  let session: FlowScopedSession | null = null;

  try {
    session = await verifyScopedRole(2);

    /* 办公类面试无需面试日程，面评带分数且允许多人各写一份 */
    const [flowRecord] = await db
      .select({ type: flow.type })
      .from(flow)
      .where(eq(flow.id, flowId))
      .limit(1);
    const isOfficeFlow = isOfficeInterviewFlow(flowRecord?.type ?? "");
    /* 办公类部门没有讲师这一级：候选人列表同样只对部长开放 */
    if (isOfficeFlow && session.role < MANAGER_ROLE) {
      throw new Error(OFFICE_MANAGER_ONLY_MESSAGE);
    }

    const candidates = await db
      .select({
        userFlowId: userFlow.id,
        uid: userFlow.fkUserId,
        status: userFlow.progressStatus,
        withdrawReason: userFlow.withdrawReason,
        portfolioLink: userFlow.portfolioLink,
        portfolioDescription: userFlow.portfolioDescription,
        applyGroup: userFlow.applyGroup,
        department: userFlow.department,
        /* 志愿顺序：1=第一志愿，2=第二志愿（技术流程不收集，恒为 NULL） */
        choice: userFlow.choice,
        /* 候选人当前所处轮次：1=一面，2=二面（其他流程为 NULL） */
        round: userFlow.round,
        /* 办公类面试不排日程，列表直接展示所选面谈时段 */
        interviewSlot: userFlow.interviewSlot,
        evalId: interviewEvaluation.id,
        evalContent: interviewEvaluation.content,
        evalScore: interviewEvaluation.score,
        evalMeetingLink: interviewEvaluation.meetingLink,
        evalRecommendation: interviewEvaluation.recommendation,
        evalStatus: interviewEvaluation.status,
        evalReturnReason: interviewEvaluation.returnReason,
        evalAuthorId: interviewEvaluation.fkUserId,
      })
      .from(userFlow)
      .leftJoin(
        interviewEvaluation,
        eq(interviewEvaluation.fkUserFlowId, userFlow.id),
      )
      .where(
        and(
          eq(userFlow.fkFlowId, flowId),
          ne(userFlow.progressStatus, "withdrawn"),
          // 候选人列表按报名归属部门收敛（办公类流程每条流程归属一个办公部门）
          departmentScopeFilter(userFlow.department, session.scope),
        ),
      );

    const dedupedCandidates = dedupeEvaluationCandidateRows(
      candidates,
      isOfficeFlow,
    );

    /* 办公类：同一用户可能同时投递两条办公类流程（第一志愿/第二志愿各一条），
       列表展示该候选人的另一条办公类报名所在部门；技术流程不涉及，恒为空。 */
    const candidateUids = [
      ...new Set(dedupedCandidates.map((candidate) => candidate.uid)),
    ];
    const officeSiblingRows =
      isOfficeFlow && candidateUids.length > 0
        ? await db
            .select({
              uid: userFlow.fkUserId,
              department: userFlow.department,
            })
            .from(userFlow)
            .innerJoin(flow, eq(userFlow.fkFlowId, flow.id))
            .where(
              and(
                inArray(userFlow.fkUserId, candidateUids),
                eq(flow.type, OFFICE_INTERVIEW_FLOW_TYPE),
                eq(flow.isDeleted, false),
                ne(userFlow.progressStatus, "withdrawn"),
              ),
            )
        : [];
    const siblingDepartmentsByUid = new Map<number, string[]>();
    for (const row of officeSiblingRows) {
      if (!row.department) continue;
      const departments = siblingDepartmentsByUid.get(row.uid);
      if (departments) {
        if (!departments.includes(row.department)) departments.push(row.department);
      } else {
        siblingDepartmentsByUid.set(row.uid, [row.department]);
      }
    }

    const userFlowIds = dedupedCandidates.map(
      (candidate) => candidate.userFlowId,
    );
    const scheduleRows =
      userFlowIds.length === 0
        ? []
        : await db
            .select({
              id: interviewSchedule.id,
              fkUserFlowId: interviewSchedule.fkUserFlowId,
              organizerId: interviewSchedule.fkOrganizerId,
              meetingLink: interviewSchedule.meetingLink,
              scheduleLink: interviewSchedule.scheduleLink,
              meetingMinuteLink: interviewSchedule.meetingMinuteLink,
              location: interviewSchedule.location,
              meetingRoomId: interviewSchedule.meetingRoomId,
              startsAt: interviewSchedule.startsAt,
              endsAt: interviewSchedule.endsAt,
              status: interviewSchedule.status,
              meetingStatus: interviewSchedule.meetingStatus,
              meetingEndedAt: interviewSchedule.meetingEndedAt,
            })
            .from(interviewSchedule)
            .where(
              and(
                inArray(interviewSchedule.fkUserFlowId, userFlowIds),
                eq(interviewSchedule.status, "created"),
              ),
            )
            .orderBy(desc(interviewSchedule.startsAt));

    const latestScheduleMap = new Map<number, (typeof scheduleRows)[number]>();
    for (const schedule of scheduleRows) {
      if (!latestScheduleMap.has(schedule.fkUserFlowId)) {
        latestScheduleMap.set(schedule.fkUserFlowId, schedule);
      }
    }

    /* 办公类面试需要展示每位部长的面评与均分，其他流程保持单份面评的数据形状 */
    const candidateEvaluations =
      isOfficeFlow && userFlowIds.length > 0
        ? await db
            .select({
              id: interviewEvaluation.id,
              userFlowId: interviewEvaluation.fkUserFlowId,
              authorId: interviewEvaluation.fkUserId,
              content: interviewEvaluation.content,
              score: interviewEvaluation.score,
              recommendation: interviewEvaluation.recommendation,
              status: interviewEvaluation.status,
              /* 面评归属轮次：1=一面，2=二面（其他流程为 NULL） */
              round: interviewEvaluation.round,
            })
            .from(interviewEvaluation)
            .where(inArray(interviewEvaluation.fkUserFlowId, userFlowIds))
            .orderBy(desc(interviewEvaluation.id))
        : [];

    const evaluationsByUserFlow = new Map<number, typeof candidateEvaluations>();
    for (const evaluation of candidateEvaluations) {
      const list = evaluationsByUserFlow.get(evaluation.userFlowId);
      if (list) {
        list.push(evaluation);
      } else {
        evaluationsByUserFlow.set(evaluation.userFlowId, [evaluation]);
      }
    }

    const userIds = [
      ...dedupedCandidates.map((candidate) => candidate.uid),
      ...scheduleRows.map((schedule) => schedule.organizerId),
      ...candidateEvaluations.map((evaluation) => evaluation.authorId),
    ].filter((id): id is number => id !== null);
    const userMap = await listPeopleUsersByLinkIds(userIds, {
      canViewSensitiveInfo: true,
    });

    return dedupedCandidates
      .map((candidate) => {
        const schedule = latestScheduleMap.get(candidate.userFlowId);
        const evaluations = evaluationsByUserFlow.get(candidate.userFlowId) ?? [];
        /* 均分与份数只统计候选人当前轮次的面评（其他轮次的历史面评仍返回给界面展示） */
        const roundEvaluations = evaluations.filter(
          (evaluation) => evaluation.round === candidate.round,
        );
        /* 只有已提交/已通过的面评参与均分，退回重写与历史不通过不计入 */
        const scoredEvaluations = roundEvaluations.filter(
          (evaluation) =>
            (evaluation.status === "submitted" ||
              evaluation.status === "approved") &&
            evaluation.score !== null,
        );
        const averageScore =
          scoredEvaluations.length === 0
            ? null
            : scoredEvaluations.reduce(
                (sum, evaluation) => sum + (evaluation.score ?? 0),
                0,
              ) / scoredEvaluations.length;
        const evaluationCount = roundEvaluations.filter(
          (evaluation) =>
            evaluation.status === "submitted" || evaluation.status === "approved",
        ).length;

        return {
          ...candidate,
          /* 同一用户另一条办公类报名的部门；技术流程与只投递一条的候选人恒为 null */
          siblingDepartment:
            siblingDepartmentsByUid
              .get(candidate.uid)
              ?.find((department) => department !== candidate.department) ?? null,
          name: userMap.get(candidate.uid)?.name ?? "未知用户",
          studentId: userMap.get(candidate.uid)?.studentId ?? null,
          qq: userMap.get(candidate.uid)?.qq ?? null,
          averageScore,
          evaluationCount,
          evaluations: evaluations.map((evaluation) => ({
            id: evaluation.id,
            score: evaluation.score,
            content: evaluation.content,
            recommendation: evaluation.recommendation,
            status: evaluation.status,
            round: evaluation.round,
            authorId: evaluation.authorId,
            authorName: userMap.get(evaluation.authorId)?.name ?? null,
            isMine: evaluation.authorId === session!.uid,
          })),
          scheduleId: schedule?.id ?? null,
          scheduleOrganizerId: schedule?.organizerId ?? null,
          scheduleOrganizerName: schedule?.organizerId
            ? userMap.get(schedule.organizerId)?.name ?? null
            : null,
          canManageSchedule:
            !schedule ||
            schedule.organizerId === session!.uid,
          canEditEvaluation: isOfficeFlow
            ? true
            : candidate.evalId === null
              ? !schedule || schedule.organizerId === session!.uid
              : schedule?.organizerId === session!.uid &&
                candidate.evalAuthorId === session!.uid,
          scheduleMeetingLink: schedule?.meetingLink ?? null,
          scheduleLink: schedule?.scheduleLink ?? null,
          scheduleMeetingMinuteLink: schedule?.meetingMinuteLink ?? null,
          scheduleLocation: schedule?.location ?? null,
          scheduleMeetingRoomId: schedule?.meetingRoomId ?? null,
          scheduleStartsAt: schedule?.startsAt ?? null,
          scheduleEndsAt: schedule?.endsAt ?? null,
          scheduleStatus: schedule?.status ?? null,
          scheduleMeetingStatus: schedule?.meetingStatus ?? null,
          scheduleMeetingEndedAt: schedule?.meetingEndedAt ?? null,
        };
      })
      .sort((a, b) => (a.studentId ?? "").localeCompare(b.studentId ?? ""));
  } catch (error) {
    logServerError("evaluation:getCandidates", error, {
      path: "/dashboard/interviews",
      userId: session?.uid ?? null,
      role: session?.role ?? null,
      action: "get-evaluation-candidates",
      flowId,
    });
    throw error;
  }
};
