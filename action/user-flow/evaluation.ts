"use server";

import { db } from "@/db/drizzle";
import { flow, flowStep, interviewEvaluation, interviewSchedule, userFlow } from "@/db/schema";
import { verifyRole } from "@/lib/dal";
import { listPeopleUsersByLinkIds } from "@/lib/link/user-lookup";
import { writeOperationAudit } from "@/lib/operation-audit";
import { logServerError } from "@/lib/server-error-log";
import { and, desc, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { syncUserRoleFromAcceptedFlows } from "./roleTransition";

/** 查找指定 flow 下某个 order 的步骤 ID */
async function findStepIdByOrderInTx(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
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

export const createEvaluation = async (
  userFlowId: number,
  content: string,
  meetingLink?: string,
) => {
  let session: Awaited<ReturnType<typeof verifyRole>> | null = null;

  try {
    session = await verifyRole(2);

    if (!content.trim()) {
      return { success: false, error: { message: "面评内容不能为空" } };
    }

    const link = meetingLink?.trim() || null;

    const existing = await db
      .select({ id: interviewEvaluation.id })
      .from(interviewEvaluation)
      .where(
        and(
          eq(interviewEvaluation.fkUserFlowId, userFlowId),
          eq(interviewEvaluation.status, "submitted"),
        ),
      )
      .limit(1);

    if (existing[0]) {
      await db.transaction(async (tx) => {
        await tx
          .update(interviewEvaluation)
          .set({
            content: content.trim(),
            meetingLink: link,
            updatedAt: new Date(),
          })
          .where(eq(interviewEvaluation.id, existing[0].id));

        const [uf] = await tx
          .select({ flowId: userFlow.fkFlowId })
          .from(userFlow)
          .where(eq(userFlow.id, userFlowId))
          .limit(1);
        const interviewStepId = uf
          ? await findStepIdByOrderInTx(tx, uf.flowId, 3)
          : null;

        await tx
          .update(userFlow)
          .set({ progressStatus: "ongoing", fkCurrentStepId: interviewStepId, updatedAt: new Date() })
          .where(eq(userFlow.id, userFlowId));

      });

      revalidatePath("/dashboard/recruitment");
      await writeOperationAudit({
        actorId: session.uid,
        action: "evaluation.update_pending",
        resourceType: "interview_evaluation",
        resourceId: existing[0].id,
        metadata: { userFlowId, hasMeetingLink: Boolean(link) },
      });
      return { success: true, data: { id: existing[0].id } };
    }

    const [evaluation] = await db.transaction(async (tx) => {
      const [uf] = await tx
        .select({ flowId: userFlow.fkFlowId })
        .from(userFlow)
        .where(eq(userFlow.id, userFlowId))
        .limit(1);
      const interviewStepId = uf
        ? await findStepIdByOrderInTx(tx, uf.flowId, 3)
        : null;

      await tx
        .update(userFlow)
        .set({ progressStatus: "ongoing", fkCurrentStepId: interviewStepId, updatedAt: new Date() })
        .where(eq(userFlow.id, userFlowId));

      const inserted = await tx
        .insert(interviewEvaluation)
        .values({
          fkUserFlowId: userFlowId,
          fkUserId: session!.uid,
          content: content.trim(),
          meetingLink: link,
          status: "submitted",
        })
        .returning();

      return inserted;
    });

    revalidatePath("/dashboard/recruitment");
    await writeOperationAudit({
      actorId: session.uid,
      action: "evaluation.create",
      resourceType: "interview_evaluation",
      resourceId: evaluation.id,
      metadata: { userFlowId, hasMeetingLink: Boolean(link) },
    });
    return { success: true, data: evaluation };
  } catch (error) {
    logServerError("evaluation:create", error, {
      path: "/dashboard/recruitment",
      userId: session?.uid ?? null,
      role: session?.role ?? null,
      action: "create-evaluation",
      userFlowId,
      metadata: { hasMeetingLink: Boolean(meetingLink?.trim()) },
    });
    throw error;
  }
};

export const rejectCandidate = async (userFlowId: number) => {
  let session: Awaited<ReturnType<typeof verifyRole>> | null = null;

  try {
    session = await verifyRole(2);

    await db.transaction(async (tx) => {
      const [uf] = await tx
        .select({ flowId: userFlow.fkFlowId })
        .from(userFlow)
        .where(eq(userFlow.id, userFlowId))
        .limit(1);
      const step2Id = uf
        ? await findStepIdByOrderInTx(tx, uf.flowId, 2)
        : null;

      await tx
        .update(userFlow)
        .set({ progressStatus: "failed", fkCurrentStepId: step2Id, updatedAt: new Date() })
        .where(eq(userFlow.id, userFlowId));

      await tx
        .delete(interviewEvaluation)
        .where(
          and(
            eq(interviewEvaluation.fkUserFlowId, userFlowId),
            eq(interviewEvaluation.status, "submitted"),
          ),
        );
    });

    revalidatePath("/dashboard/recruitment");
    await writeOperationAudit({
      actorId: session.uid,
      action: "evaluation.reject_candidate",
      resourceType: "user_flow",
      resourceId: userFlowId,
    });
  } catch (error) {
    logServerError("evaluation:rejectCandidate", error, {
      path: "/dashboard/recruitment",
      userId: session?.uid ?? null,
      role: session?.role ?? null,
      action: "reject-candidate-before-evaluation",
      userFlowId,
    });
    throw error;
  }
};

export const reopenAndEvaluate = async (
  userFlowId: number,
  content: string,
  meetingLink?: string,
) => {
  let session: Awaited<ReturnType<typeof verifyRole>> | null = null;

  try {
    session = await verifyRole(2);

    if (!content.trim()) {
      return { success: false, error: { message: "面评内容不能为空" } };
    }

    const link = meetingLink?.trim() || null;

    await db.transaction(async (tx) => {
      const [uf] = await tx
        .select({ flowId: userFlow.fkFlowId })
        .from(userFlow)
        .where(eq(userFlow.id, userFlowId))
        .limit(1);
      const interviewStepId = uf
        ? await findStepIdByOrderInTx(tx, uf.flowId, 3)
        : null;

      await tx
        .update(userFlow)
        .set({ progressStatus: "ongoing", fkCurrentStepId: interviewStepId, updatedAt: new Date() })
        .where(eq(userFlow.id, userFlowId));

      await tx.insert(interviewEvaluation).values({
        fkUserFlowId: userFlowId,
        fkUserId: session!.uid,
        content: content.trim(),
        meetingLink: link,
        status: "submitted",
      });

    });

    revalidatePath("/dashboard/recruitment");
    await writeOperationAudit({
      actorId: session.uid,
      action: "evaluation.reopen_and_create",
      resourceType: "user_flow",
      resourceId: userFlowId,
      metadata: { hasMeetingLink: Boolean(link) },
    });
    return { success: true };
  } catch (error) {
    logServerError("evaluation:reopenAndEvaluate", error, {
      path: "/dashboard/recruitment",
      userId: session?.uid ?? null,
      role: session?.role ?? null,
      action: "reopen-and-evaluate",
      userFlowId,
      metadata: { hasMeetingLink: Boolean(meetingLink?.trim()) },
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
        .select({ fkUserFlowId: interviewEvaluation.fkUserFlowId })
        .from(interviewEvaluation)
        .where(eq(interviewEvaluation.id, evaluationId))
        .limit(1);

      if (!evalRecord) throw new Error("面评不存在");

      await tx
        .update(interviewEvaluation)
        .set({
          status: "approved",
          fkReviewedBy: session!.uid,
          updatedAt: new Date(),
        })
        .where(eq(interviewEvaluation.id, evaluationId));

      const [uf] = await tx
        .select({ fkUserId: userFlow.fkUserId, flowId: userFlow.fkFlowId })
        .from(userFlow)
        .where(eq(userFlow.id, evalRecord.fkUserFlowId))
        .limit(1);

      if (uf) {
        affectedUserId = uf.fkUserId;
        const step3Id = await findStepIdByOrderInTx(tx, uf.flowId, 3);
        await tx
          .update(userFlow)
          .set({ progressStatus: "passed", fkCurrentStepId: step3Id, updatedAt: new Date() })
          .where(eq(userFlow.id, evalRecord.fkUserFlowId));
      }
    });

    if (affectedUserId !== null) {
      await syncUserRoleFromAcceptedFlows(affectedUserId);
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

      await tx
        .update(interviewEvaluation)
        .set({
          status: "rejected",
          fkReviewedBy: session!.uid,
          updatedAt: new Date(),
        })
        .where(eq(interviewEvaluation.id, evaluationId));

      const [uf] = await tx
        .select({ fkUserId: userFlow.fkUserId, flowId: userFlow.fkFlowId })
        .from(userFlow)
        .where(eq(userFlow.id, evalRecord.fkUserFlowId))
        .limit(1);

      if (uf) {
        affectedUserId = uf.fkUserId;
        const step3Id = await findStepIdByOrderInTx(tx, uf.flowId, 3);
        await tx
          .update(userFlow)
          .set({ progressStatus: "failed", fkCurrentStepId: step3Id, updatedAt: new Date() })
          .where(eq(userFlow.id, evalRecord.fkUserFlowId));
      }

      if (evalRecord.status !== "approved") {
        affectedUserId = null;
      }
    });

    if (affectedUserId !== null) {
      await syncUserRoleFromAcceptedFlows(affectedUserId);
    }

    revalidatePath("/dashboard/approvals");
    revalidatePath("/dashboard/recruitment");
    await writeOperationAudit({
      actorId: session.uid,
      action: "evaluation.reject",
      resourceType: "interview_evaluation",
      resourceId: evaluationId,
      metadata: { affectedUserId },
    });
  } catch (error) {
    logServerError("evaluation:reject", error, {
      path: "/dashboard/approvals",
      userId: session?.uid ?? null,
      role: session?.role ?? null,
      action: "reject-evaluation",
      metadata: { evaluationId, affectedUserId },
    });
    throw error;
  }
};

export const reopenEvaluation = async (evaluationId: number) => {
  let session: Awaited<ReturnType<typeof verifyRole>> | null = null;

  try {
    session = await verifyRole(3);

    const [evalRecord] = await db
      .select({
        status: interviewEvaluation.status,
        fkUserFlowId: interviewEvaluation.fkUserFlowId,
      })
      .from(interviewEvaluation)
      .where(eq(interviewEvaluation.id, evaluationId))
      .limit(1);

    if (!evalRecord) throw new Error("面评不存在");
    if (evalRecord.status !== "rejected") throw new Error("只能撤销已驳回的面评");

    await db.transaction(async (tx) => {
      await tx
        .update(interviewEvaluation)
        .set({
          status: "submitted",
          fkReviewedBy: null,
          updatedAt: new Date(),
        })
        .where(eq(interviewEvaluation.id, evaluationId));

      const [uf] = await tx
        .select({ flowId: userFlow.fkFlowId })
        .from(userFlow)
        .where(eq(userFlow.id, evalRecord.fkUserFlowId))
        .limit(1);
      const step3Id = uf
        ? await findStepIdByOrderInTx(tx, uf.flowId, 3)
        : null;

      await tx
        .update(userFlow)
        .set({ progressStatus: "ongoing", fkCurrentStepId: step3Id, updatedAt: new Date() })
        .where(eq(userFlow.id, evalRecord.fkUserFlowId));
    });

    revalidatePath("/dashboard/approvals");
    revalidatePath("/dashboard/recruitment");
    await writeOperationAudit({
      actorId: session.uid,
      action: "evaluation.reopen",
      resourceType: "interview_evaluation",
      resourceId: evaluationId,
    });
  } catch (error) {
    logServerError("evaluation:reopen", error, {
      path: "/dashboard/approvals",
      userId: session?.uid ?? null,
      role: session?.role ?? null,
      action: "reopen-evaluation",
      metadata: { evaluationId },
    });
    throw error;
  }
};

export const getEvaluation = async (userFlowId: number) => {
  let session: Awaited<ReturnType<typeof verifyRole>> | null = null;

  try {
    session = await verifyRole(2);

    const result = await db
      .select({
        evaluation: interviewEvaluation,
      })
      .from(interviewEvaluation)
      .where(eq(interviewEvaluation.fkUserFlowId, userFlowId))
      .orderBy(interviewEvaluation.createdAt)
      .limit(1);

    if (!result[0]) return null;
    const authorMap = await listPeopleUsersByLinkIds([
      result[0].evaluation.fkUserId,
    ]);

    return {
      evaluation: result[0].evaluation,
      authorName: authorMap.get(result[0].evaluation.fkUserId)?.name ?? null,
    };
  } catch (error) {
    logServerError("evaluation:get", error, {
      path: "/dashboard/recruitment",
      userId: session?.uid ?? null,
      role: session?.role ?? null,
      action: "get-evaluation",
      userFlowId,
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
      .orderBy(interviewEvaluation.createdAt);

    const userMap = await listPeopleUsersByLinkIds(
      rows.flatMap((row) => [
        row.authorId,
        row.candidateId,
      ]).filter((id): id is number => id !== null),
    );

    return rows.map((row) => ({
      ...row,
      authorName: userMap.get(row.authorId)?.name ?? null,
      candidateName: row.candidateId
        ? userMap.get(row.candidateId)?.name ?? null
        : null,
      candidateStudentId: row.candidateId
        ? userMap.get(row.candidateId)?.studentId ?? null
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
        evalStatus: interviewEvaluation.status,
      })
      .from(userFlow)
      .leftJoin(
        interviewEvaluation,
        eq(interviewEvaluation.fkUserFlowId, userFlow.id),
      )
      .where(eq(userFlow.fkFlowId, flowId));

    const userFlowIds = candidates.map((candidate) => candidate.userFlowId);
    const scheduleRows = userFlowIds.length === 0
      ? []
      : await db
          .select({
            id: interviewSchedule.id,
            fkUserFlowId: interviewSchedule.fkUserFlowId,
            meetingLink: interviewSchedule.meetingLink,
            meetingMinuteLink: interviewSchedule.meetingMinuteLink,
            startsAt: interviewSchedule.startsAt,
            endsAt: interviewSchedule.endsAt,
            status: interviewSchedule.status,
          })
          .from(interviewSchedule)
          .where(
            and(
              inArray(interviewSchedule.fkUserFlowId, userFlowIds),
              eq(interviewSchedule.status, "created"),
            ),
          )
          .orderBy(desc(interviewSchedule.startsAt));
    const latestScheduleMap = new Map<number, typeof scheduleRows[number]>();
    for (const schedule of scheduleRows) {
      if (!latestScheduleMap.has(schedule.fkUserFlowId)) {
        latestScheduleMap.set(schedule.fkUserFlowId, schedule);
      }
    }

    const userMap = await listPeopleUsersByLinkIds(
      candidates.map((candidate) => candidate.uid),
      { canViewSensitiveInfo: session.role >= 3 },
    );

    return candidates.map((candidate) => ({
      ...candidate,
      name: userMap.get(candidate.uid)?.name ?? "未知用户",
      studentId: userMap.get(candidate.uid)?.studentId ?? null,
      phoneNumber: session!.role >= 3 ? userMap.get(candidate.uid)?.phone ?? null : null,
      scheduleId: latestScheduleMap.get(candidate.userFlowId)?.id ?? null,
      scheduleMeetingLink: latestScheduleMap.get(candidate.userFlowId)?.meetingLink ?? null,
      scheduleMeetingMinuteLink: latestScheduleMap.get(candidate.userFlowId)?.meetingMinuteLink ?? null,
      scheduleStartsAt: latestScheduleMap.get(candidate.userFlowId)?.startsAt ?? null,
      scheduleEndsAt: latestScheduleMap.get(candidate.userFlowId)?.endsAt ?? null,
      scheduleStatus: latestScheduleMap.get(candidate.userFlowId)?.status ?? null,
    })).sort((a, b) => (a.studentId ?? "").localeCompare(b.studentId ?? ""));
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
