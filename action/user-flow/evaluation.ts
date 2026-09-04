"use server";

import { db } from "@/db/drizzle";
import {
  flow,
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
import { verifyRole } from "@/lib/dal";
import {
  loadFeishuApprovalNotificationRecord,
  sendFeishuApprovalCard,
} from "@/lib/feishu/approval-notification";
import { listPeopleUsersByLinkIds } from "@/lib/link/user-lookup";
import { writeOperationAudit } from "@/lib/operation-audit";
import { logServerError } from "@/lib/server-error-log";
import { and, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { syncUserRoleFromAcceptedFlows } from "./roleTransition";
import { getFeishuOAuthAccountStatus } from "@/lib/feishu/oauth-account";
import { sendInterviewEvaluationReturnedCard } from "@/lib/feishu/interview-message";
import { MIN_PASSED_EVALUATION_LENGTH } from "@/lib/evaluation-constants";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type EvaluationRecommendation = "passed" | "failed";

function isEvaluationRecommendation(
  value: string,
): value is EvaluationRecommendation {
  return value === "passed" || value === "failed";
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

async function moveUserFlowInTx(
  tx: Tx,
  userFlowId: number,
  progressStatus: "ongoing" | "passed" | "failed",
  stepType: EvaluationFlowStepType,
) {
  const [uf] = await tx
    .select({ flowId: userFlow.fkFlowId })
    .from(userFlow)
    .where(eq(userFlow.id, userFlowId))
    .limit(1);

  const stepId = uf
    ? await findEvaluationStepIdInTx(tx, uf.flowId, stepType)
    : null;

  await tx
    .update(userFlow)
    .set({
      progressStatus,
      fkCurrentStepId: stepId,
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

async function safeSyncUserRole(uid: number, context: {
  action: string;
  path: string;
  actorId: number | null;
  actorRole: number | null;
  metadata?: Record<string, unknown>;
}) {
  try {
    await syncUserRoleFromAcceptedFlows(uid);
  } catch (error) {
    logServerError(context.action, error, {
      path: context.path,
      userId: context.actorId,
      role: context.actorRole,
      action: context.action,
      metadata: context.metadata,
    });
  }
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
  session: NonNullable<Awaited<ReturnType<typeof verifyRole>>>,
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
  recommendation: EvaluationRecommendation,
  meetingLink?: string,
) => {
  let session: Awaited<ReturnType<typeof verifyRole>> | null = null;

  try {
    session = await verifyRole(2);

    if (!content.trim()) {
      return { success: false, error: { message: "面评内容不能为空" } };
    }
    if (!isEvaluationRecommendation(recommendation)) {
      return { success: false, error: { message: "请选择讲师建议" } };
    }
    if (recommendation === "passed" && content.trim().length < MIN_PASSED_EVALUATION_LENGTH) {
      return {
        success: false,
        error: { message: `建议通过时，面评内容至少需要 ${MIN_PASSED_EVALUATION_LENGTH} 个字。` },
      };
    }

    const hasMeetingLinkArg = meetingLink !== undefined;
    const link = hasMeetingLinkArg ? meetingLink.trim() || null : undefined;

    const result = await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(${userFlowId})`);
      const [currentFlow] = await tx
        .select({ progressStatus: userFlow.progressStatus })
        .from(userFlow)
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
        evaluationStepTypeForAction("submit_for_review"),
      );

      if (active?.status === "submitted" || active?.status === "returned") {
        await tx
          .update(interviewEvaluation)
          .set({
            content: content.trim(),
            recommendation,
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
          recommendation,
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
      metadata: {
        userFlowId,
        hasMeetingLink: hasMeetingLinkArg
          ? Boolean(link)
          : undefined,
        recommendation,
      },
    });

    await safeNotifyFeishuApprovalGroup(
      result.evaluationId,
      session,
    );

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
  let session: Awaited<ReturnType<typeof verifyRole>> | null = null;
  let affectedUserId: number | null = null;

  try {
    session = await verifyRole(3);

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

      const [uf] = await tx
        .select({ fkUserId: userFlow.fkUserId })
        .from(userFlow)
        .where(eq(userFlow.id, evalRecord.fkUserFlowId))
        .limit(1);

      if (uf) {
        affectedUserId = uf.fkUserId;
        await moveUserFlowInTx(
          tx,
          evalRecord.fkUserFlowId,
          "passed",
          evaluationStepTypeForAction("admin_decision"),
        );
      }
    });

    if (affectedUserId !== null) {
      await safeSyncUserRole(affectedUserId, {
        action: "evaluation:approve:role-sync",
        path: "/dashboard/approvals",
        actorId: session.uid,
        actorRole: session.role,
        metadata: { evaluationId, affectedUserId },
      });
    }

    revalidatePath("/dashboard/approvals");
    revalidatePath("/dashboard/interviews");
    await writeOperationAudit({
      actorId: session.uid,
      actorRole: session.role,
      action: "evaluation.approve",
      resourceType: "interview_evaluation",
      resourceId: evaluationId,
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
  let session: Awaited<ReturnType<typeof verifyRole>> | null = null;

  try {
    session = await verifyRole(3);

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
        evaluationStepTypeForAction("admin_decision"),
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
  let session: Awaited<ReturnType<typeof verifyRole>> | null = null;
  try {
    session = await verifyRole(3);
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
      if (!canReturnEvaluation(evaluation.status)) throw new Error("只能退回待终审的面评");
      await tx.update(interviewEvaluation).set({
        status: "returned",
        returnReason: normalizedReason,
        fkReviewedBy: session!.uid,
        updatedAt: new Date(),
      }).where(eq(interviewEvaluation.id, evaluationId));
      await moveUserFlowInTx(tx, evaluation.userFlowId, "ongoing", evaluationStepTypeForAction("submit_for_review"));
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
    await writeOperationAudit({ actorId: session.uid, actorRole: session.role, action: "evaluation.return", resourceType: "interview_evaluation", resourceId: evaluationId, metadata: { reason: normalizedReason } });
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
  let session: Awaited<ReturnType<typeof verifyRole>> | null = null;

  try {
    session = await verifyRole(3);

    const rows = await db
      .select({
        evaluation: interviewEvaluation,
        meetingLink: interviewEvaluation.meetingLink,
        portfolioLink: userFlow.portfolioLink,
        portfolioDescription: userFlow.portfolioDescription,
        applyGroup: userFlow.applyGroup,
        authorId: interviewEvaluation.fkUserId,
        candidateId: userFlow.fkUserId,
        flowTitle: flow.title,
        flowType: flow.type,
      })
      .from(interviewEvaluation)
      .leftJoin(userFlow, eq(interviewEvaluation.fkUserFlowId, userFlow.id))
      .leftJoin(flow, eq(userFlow.fkFlowId, flow.id))
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
  let session: Awaited<ReturnType<typeof verifyRole>> | null = null;

  try {
    session = await verifyRole(2);

    const candidates = await db
      .select({
        userFlowId: userFlow.id,
        uid: userFlow.fkUserId,
        status: userFlow.progressStatus,
        withdrawReason: userFlow.withdrawReason,
        portfolioLink: userFlow.portfolioLink,
        portfolioDescription: userFlow.portfolioDescription,
        applyGroup: userFlow.applyGroup,
        evalId: interviewEvaluation.id,
        evalContent: interviewEvaluation.content,
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
        ),
      );

    const dedupedCandidates = dedupeEvaluationCandidateRows(candidates);

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

    const userIds = [
      ...dedupedCandidates.map((candidate) => candidate.uid),
      ...scheduleRows.map((schedule) => schedule.organizerId),
    ].filter((id): id is number => id !== null);
    const userMap = await listPeopleUsersByLinkIds(userIds, {
      canViewSensitiveInfo: true,
    });

    return dedupedCandidates
      .map((candidate) => {
        const schedule = latestScheduleMap.get(candidate.userFlowId);
        return {
          ...candidate,
          name: userMap.get(candidate.uid)?.name ?? "未知用户",
          studentId: userMap.get(candidate.uid)?.studentId ?? null,
          qq: userMap.get(candidate.uid)?.qq ?? null,
          scheduleId: schedule?.id ?? null,
          scheduleOrganizerId: schedule?.organizerId ?? null,
          scheduleOrganizerName: schedule?.organizerId
            ? userMap.get(schedule.organizerId)?.name ?? null
            : null,
          canManageSchedule:
            !schedule ||
            schedule.organizerId === session!.uid,
          canEditEvaluation:
            candidate.evalId === null
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
