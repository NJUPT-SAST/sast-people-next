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
  canRejectEvaluation,
  dedupeEvaluationCandidateRows,
  evaluationStepTypeForAction,
  type EvaluationFlowStepType,
} from "@/lib/evaluation-state";
import { verifyRole } from "@/lib/dal";
import { listPeopleUsersByLinkIds } from "@/lib/link/user-lookup";
import { writeOperationAudit } from "@/lib/operation-audit";
import { logServerError } from "@/lib/server-error-log";
import { and, desc, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { syncUserRoleFromAcceptedFlows } from "./roleTransition";

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
  const selectByStatus = (status: "approved" | "submitted") =>
    tx
      .select({
        id: interviewEvaluation.id,
        status: interviewEvaluation.status,
        meetingLink: interviewEvaluation.meetingLink,
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
  return submitted ?? null;
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

    const hasMeetingLinkArg = meetingLink !== undefined;
    const link = hasMeetingLinkArg ? meetingLink.trim() || null : undefined;

    const result = await db.transaction(async (tx) => {
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
          .select({ meetingStatus: interviewSchedule.meetingStatus })
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

        if (activeSchedule.meetingStatus !== "ended") {
          return {
            success: false as const,
            error: { message: "请先确认面试结束后再提交面评" },
          };
        }
      }

      await moveUserFlowInTx(
        tx,
        userFlowId,
        "ongoing",
        evaluationStepTypeForAction("submit_for_review"),
      );

      if (active?.status === "submitted") {
        await tx
          .update(interviewEvaluation)
          .set({
            content: content.trim(),
            recommendation,
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

    revalidatePath("/dashboard/recruitment");
    revalidatePath("/dashboard/approvals");
    await writeOperationAudit({
      actorId: session.uid,
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
    return { success: true, data: result.data };
  } catch (error) {
    logServerError("evaluation:create", error, {
      path: "/dashboard/recruitment",
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
        })
        .from(interviewEvaluation)
        .where(eq(interviewEvaluation.id, evaluationId))
        .limit(1);

      if (!evalRecord) throw new Error("面评不存在");
      if (!canApproveEvaluation(evalRecord.status)) {
        throw new Error("只能通过待终审的面评");
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
    revalidatePath("/dashboard/recruitment");
    await writeOperationAudit({
      actorId: session.uid,
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
        .limit(1);

      if (!evalRecord) throw new Error("面评不存在");
      if (!canRejectEvaluation(evalRecord.status)) {
        throw new Error("只能驳回待终审的面评");
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
    revalidatePath("/dashboard/recruitment");
    await writeOperationAudit({
      actorId: session.uid,
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


export const getAllEvaluations = async () => {
  let session: Awaited<ReturnType<typeof verifyRole>> | null = null;

  try {
    session = await verifyRole(3);

    const rows = await db
      .select({
        evaluation: interviewEvaluation,
        meetingLink: interviewEvaluation.meetingLink,
        portfolioLink: userFlow.portfolioLink,
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
            minuteLink: interviewSchedule.meetingMinuteLink,
            updatedAt: interviewSchedule.updatedAt,
          })
          .from(interviewSchedule)
          .where(inArray(interviewSchedule.fkUserFlowId, userFlowIds))
          .orderBy(desc(interviewSchedule.updatedAt));
    const minuteByEvaluation = new Map<number, string>();
    const minuteByUserFlow = new Map<number, string>();
    for (const schedule of schedules) {
      if (!schedule.minuteLink) continue;
      if (schedule.evaluationId && !minuteByEvaluation.has(schedule.evaluationId)) {
        minuteByEvaluation.set(schedule.evaluationId, schedule.minuteLink);
      }
      if (!minuteByUserFlow.has(schedule.userFlowId)) {
        minuteByUserFlow.set(schedule.userFlowId, schedule.minuteLink);
      }
    }

    const userMap = await listPeopleUsersByLinkIds(
      rows
        .flatMap((row) => [row.authorId, row.candidateId])
        .filter((id): id is number => id !== null),
    );

    return rows.map((row) => ({
      ...row,
      meetingLink:
        row.meetingLink ??
        minuteByEvaluation.get(row.evaluation.id) ??
        minuteByUserFlow.get(row.evaluation.fkUserFlowId) ??
        null,
      authorName: userMap.get(row.authorId)?.name ?? null,
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
        portfolioLink: userFlow.portfolioLink,
        evalId: interviewEvaluation.id,
        evalContent: interviewEvaluation.content,
        evalMeetingLink: interviewEvaluation.meetingLink,
        evalRecommendation: interviewEvaluation.recommendation,
        evalStatus: interviewEvaluation.status,
      })
      .from(userFlow)
      .leftJoin(
        interviewEvaluation,
        eq(interviewEvaluation.fkUserFlowId, userFlow.id),
      )
      .where(eq(userFlow.fkFlowId, flowId));

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
              meetingLink: interviewSchedule.meetingLink,
              scheduleLink: interviewSchedule.scheduleLink,
              meetingMinuteLink: interviewSchedule.meetingMinuteLink,
              location: interviewSchedule.location,
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

    const userMap = await listPeopleUsersByLinkIds(
      dedupedCandidates.map((candidate) => candidate.uid),
      { canViewSensitiveInfo: true },
    );

    return dedupedCandidates
      .map((candidate) => ({
        ...candidate,
        name: userMap.get(candidate.uid)?.name ?? "未知用户",
        studentId: userMap.get(candidate.uid)?.studentId ?? null,
        qq: userMap.get(candidate.uid)?.qq ?? null,
        scheduleId: latestScheduleMap.get(candidate.userFlowId)?.id ?? null,
        scheduleMeetingLink:
          latestScheduleMap.get(candidate.userFlowId)?.meetingLink ?? null,
        scheduleLink:
          latestScheduleMap.get(candidate.userFlowId)?.scheduleLink ?? null,
        scheduleMeetingMinuteLink:
          latestScheduleMap.get(candidate.userFlowId)?.meetingMinuteLink ??
          null,
        scheduleLocation:
          latestScheduleMap.get(candidate.userFlowId)?.location ?? null,
        scheduleStartsAt:
          latestScheduleMap.get(candidate.userFlowId)?.startsAt ?? null,
        scheduleEndsAt:
          latestScheduleMap.get(candidate.userFlowId)?.endsAt ?? null,
        scheduleStatus:
          latestScheduleMap.get(candidate.userFlowId)?.status ?? null,
        scheduleMeetingStatus:
          latestScheduleMap.get(candidate.userFlowId)?.meetingStatus ?? null,
        scheduleMeetingEndedAt:
          latestScheduleMap.get(candidate.userFlowId)?.meetingEndedAt ?? null,
      }))
      .sort((a, b) => (a.studentId ?? "").localeCompare(b.studentId ?? ""));
  } catch (error) {
    logServerError("evaluation:getCandidates", error, {
      path: "/dashboard/recruitment",
      userId: session?.uid ?? null,
      role: session?.role ?? null,
      action: "get-evaluation-candidates",
      flowId,
    });
    throw error;
  }
};
