"use server";

import { db } from "@/db/drizzle";
import { flow, interviewEvaluation, user, userFlow } from "@/db/schema";
import { verifyRole } from "@/lib/dal";
import { aliasedTable, and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { syncUserRoleFromAcceptedFlows } from "./roleTransition";

export const createEvaluation = async (
  userFlowId: number,
  content: string,
  meetingLink?: string,
) => {
  const session = await verifyRole(2);

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
        eq(interviewEvaluation.status, "pending"),
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

      await tx
        .update(userFlow)
        .set({ status: "ongoing", currentStepOrder: 3 })
        .where(eq(userFlow.id, userFlowId));
    });

    revalidatePath("/dashboard/recruitment");
    return { success: true, data: { id: existing[0].id } };
  }

  const [evaluation] = await db.transaction(async (tx) => {
    await tx
      .update(userFlow)
      .set({ status: "ongoing", currentStepOrder: 3 })
      .where(eq(userFlow.id, userFlowId));

    return tx
      .insert(interviewEvaluation)
      .values({
        fkUserFlowId: userFlowId,
        fkUserId: session.uid,
        content: content.trim(),
        meetingLink: link,
        status: "pending",
      })
      .returning();
  });

  revalidatePath("/dashboard/recruitment");
  return { success: true, data: evaluation };
};

export const rejectCandidate = async (userFlowId: number) => {
  await verifyRole(2);

  await db.transaction(async (tx) => {
    await tx
      .update(userFlow)
      .set({ status: "rejected", currentStepOrder: 2 })
      .where(eq(userFlow.id, userFlowId));

    await tx
      .delete(interviewEvaluation)
      .where(
        and(
          eq(interviewEvaluation.fkUserFlowId, userFlowId),
          eq(interviewEvaluation.status, "pending"),
        ),
      );
  });

  revalidatePath("/dashboard/recruitment");
};

export const reopenAndEvaluate = async (
  userFlowId: number,
  content: string,
  meetingLink?: string,
) => {
  const session = await verifyRole(2);

  if (!content.trim()) {
    return { success: false, error: { message: "面评内容不能为空" } };
  }

  const link = meetingLink?.trim() || null;

  await db.transaction(async (tx) => {
    await tx
      .update(userFlow)
      .set({ status: "ongoing", currentStepOrder: 3 })
      .where(eq(userFlow.id, userFlowId));

    await tx.insert(interviewEvaluation).values({
      fkUserFlowId: userFlowId,
      fkUserId: session.uid,
      content: content.trim(),
      meetingLink: link,
      status: "pending",
    });
  });

  revalidatePath("/dashboard/recruitment");
  return { success: true };
};

export const approveEvaluation = async (evaluationId: number) => {
  const session = await verifyRole(3);
  let affectedUserId: number | null = null;

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
        fkReviewedBy: session.uid,
        updatedAt: new Date(),
      })
      .where(eq(interviewEvaluation.id, evaluationId));

    const [record] = await tx
      .select({ fkUserId: userFlow.fkUserId })
      .from(userFlow)
      .where(eq(userFlow.id, evalRecord.fkUserFlowId))
      .limit(1);

    if (record) {
      affectedUserId = record.fkUserId;
      await tx
        .update(userFlow)
        .set({ status: "accepted", currentStepOrder: 3 })
        .where(eq(userFlow.id, evalRecord.fkUserFlowId));
    }
  });

  if (affectedUserId !== null) {
    await syncUserRoleFromAcceptedFlows(affectedUserId);
  }

  revalidatePath("/dashboard/approvals");
  revalidatePath("/dashboard/recruitment");
};

export const rejectEvaluation = async (evaluationId: number) => {
  const session = await verifyRole(3);
  let affectedUserId: number | null = null;

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
        fkReviewedBy: session.uid,
        updatedAt: new Date(),
      })
      .where(eq(interviewEvaluation.id, evaluationId));

    const [record] = await tx
      .select({ fkUserId: userFlow.fkUserId })
      .from(userFlow)
      .where(eq(userFlow.id, evalRecord.fkUserFlowId))
      .limit(1);

    if (record) {
      affectedUserId = record.fkUserId;
      await tx
        .update(userFlow)
        .set({ status: "rejected", currentStepOrder: 3 })
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
};

export const reopenEvaluation = async (evaluationId: number) => {
  await verifyRole(3);

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
        status: "pending",
        fkReviewedBy: null,
        updatedAt: new Date(),
      })
      .where(eq(interviewEvaluation.id, evaluationId));

    await tx
      .update(userFlow)
      .set({ status: "ongoing", currentStepOrder: 3 })
      .where(eq(userFlow.id, evalRecord.fkUserFlowId));
  });

  revalidatePath("/dashboard/approvals");
  revalidatePath("/dashboard/recruitment");
};

export const getEvaluation = async (userFlowId: number) => {
  await verifyRole(2);

  const result = await db
    .select({
      evaluation: interviewEvaluation,
      authorName: user.name,
    })
    .from(interviewEvaluation)
    .leftJoin(user, eq(interviewEvaluation.fkUserId, user.id))
    .where(eq(interviewEvaluation.fkUserFlowId, userFlowId))
    .orderBy(interviewEvaluation.createdAt)
    .limit(1);

  if (!result[0]) return null;

  return {
    evaluation: result[0].evaluation,
    authorName: result[0].authorName,
  };
};

export const getAllEvaluations = async () => {
  await verifyRole(3);

  const author = aliasedTable(user, "author");
  const candidate = aliasedTable(user, "candidate");

  return db
    .select({
      evaluation: interviewEvaluation,
      meetingLink: interviewEvaluation.meetingLink,
      authorName: author.name,
      candidateName: candidate.name,
      candidateStudentId: candidate.studentId,
      flowTitle: flow.title,
      flowType: flow.type,
    })
    .from(interviewEvaluation)
    .leftJoin(author, eq(interviewEvaluation.fkUserId, author.id))
    .leftJoin(userFlow, eq(interviewEvaluation.fkUserFlowId, userFlow.id))
    .leftJoin(flow, eq(userFlow.fkFlowId, flow.id))
    .leftJoin(candidate, eq(userFlow.fkUserId, candidate.id))
    .orderBy(interviewEvaluation.createdAt);
};

export const getEvaluationCandidates = async (flowId: number) => {
  const session = await verifyRole(2);

  const candidates = await db
    .select({
      userFlowId: userFlow.id,
      uid: user.id,
      name: user.name,
      studentId: user.studentId,
      phoneNumber: user.phone,
      status: userFlow.status,
      evalId: interviewEvaluation.id,
      evalContent: interviewEvaluation.content,
      evalMeetingLink: interviewEvaluation.meetingLink,
      evalStatus: interviewEvaluation.status,
    })
    .from(userFlow)
    .innerJoin(user, eq(userFlow.fkUserId, user.id))
    .leftJoin(
      interviewEvaluation,
      eq(interviewEvaluation.fkUserFlowId, userFlow.id),
    )
    .where(eq(userFlow.fkFlowId, flowId))
    .orderBy(user.studentId);

  return candidates.map((candidate) => ({
    ...candidate,
    phoneNumber: session.role >= 3 ? candidate.phoneNumber : null,
  }));
};
