"use server";

import { db } from "@/db/drizzle";
import { flow, interviewEvaluation, user, userFlow } from "@/db/schema";
import { verifyRole } from "@/lib/dal";
import { aliasedTable, eq, and, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";

export const createEvaluation = async (userFlowId: number, content: string, meetingLink?: string) => {
  const session = await verifyRole(2);

  if (!content.trim()) {
    return { success: false, error: { message: "面评内容不能为空" } };
  }

  const link = meetingLink?.trim() || null;

  // If a pending evaluation already exists, update it in place
  const existing = await db
    .select({ id: interviewEvaluation.id })
    .from(interviewEvaluation)
    .where(
      and(
        eq(interviewEvaluation.fkUserFlowId, userFlowId),
        eq(interviewEvaluation.status, "pending"),
      )
    )
    .limit(1);

  if (existing[0]) {
    await db
      .update(interviewEvaluation)
      .set({
        content: content.trim(),
        meetingLink: link,
        updatedAt: new Date(),
      })
      .where(eq(interviewEvaluation.id, existing[0].id));

    revalidatePath("/dashboard/recruitment");
    return { success: true, data: { id: existing[0].id } };
  }

  const [evaluation] = await db
    .insert(interviewEvaluation)
    .values({
      fkUserFlowId: userFlowId,
      fkUserId: session.uid,
      content: content.trim(),
      meetingLink: link,
      status: "pending",
    })
    .returning();

  revalidatePath("/dashboard/recruitment");
  return { success: true, data: evaluation };
};

// Instructor directly rejects a candidate (no evaluation needed)
export const rejectCandidate = async (userFlowId: number) => {
  await verifyRole(2);

  await db.transaction(async (tx) => {
    await tx
      .update(userFlow)
      .set({ status: "rejected" })
      .where(eq(userFlow.id, userFlowId));

    // Delete any pending evaluation so the candidate shows correctly as "不通过"
    await tx
      .delete(interviewEvaluation)
      .where(
        and(
          eq(interviewEvaluation.fkUserFlowId, userFlowId),
          eq(interviewEvaluation.status, "pending"),
        )
      );
  });

  revalidatePath("/dashboard/recruitment");
};

// Revert a rejected candidate back to ongoing and create pending evaluation
export const reopenAndEvaluate = async (userFlowId: number, content: string, meetingLink?: string) => {
  const session = await verifyRole(2);

  if (!content.trim()) {
    return { success: false, error: { message: "面评内容不能为空" } };
  }

  const link = meetingLink?.trim() || null;

  await db.transaction(async (tx) => {
    await tx
      .update(userFlow)
      .set({ status: "ongoing" })
      .where(eq(userFlow.id, userFlowId));

    await tx
      .insert(interviewEvaluation)
      .values({
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

  await db.transaction(async (tx) => {
    const [evalRecord] = await tx
      .select({
        fkUserFlowId: interviewEvaluation.fkUserFlowId,
      })
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

    // Update user flow and promote role
    const record = await tx
      .select({ fkUserId: userFlow.fkUserId, flowType: flow.type, userRole: user.role })
      .from(userFlow)
      .innerJoin(flow, eq(userFlow.fkFlowId, flow.id))
      .innerJoin(user, eq(userFlow.fkUserId, user.id))
      .where(eq(userFlow.id, evalRecord.fkUserFlowId))
      .limit(1);

    if (record[0]) {
      const { fkUserId, flowType, userRole } = record[0];
      let nextRole = userRole;
      if ((flowType === "recruitment" || flowType === "recruitment_exemption") && userRole === 0) {
        nextRole = 1;
      } else if (flowType === "soc" && userRole === 1) {
        nextRole = 2;
      }

      await tx
        .update(userFlow)
        .set({ status: "accepted" })
        .where(eq(userFlow.id, evalRecord.fkUserFlowId));

      if (nextRole !== userRole) {
        await tx
          .update(user)
          .set({ role: nextRole, updatedAt: new Date() })
          .where(eq(user.id, fkUserId));
      }
    }
  });

  revalidatePath("/dashboard/approvals");
  revalidatePath("/dashboard/recruitment");
};

export const rejectEvaluation = async (evaluationId: number) => {
  const session = await verifyRole(3);

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

    // If reverting an approved evaluation, revert user flow and role promotion
    if (evalRecord.status === "approved") {
      const record = await tx
        .select({ fkUserId: userFlow.fkUserId, flowType: flow.type, userRole: user.role })
        .from(userFlow)
        .innerJoin(flow, eq(userFlow.fkFlowId, flow.id))
        .innerJoin(user, eq(userFlow.fkUserId, user.id))
        .where(eq(userFlow.id, evalRecord.fkUserFlowId))
        .limit(1);

      if (record[0]) {
        const { fkUserId, flowType, userRole } = record[0];
        let prevRole = userRole;
        if ((flowType === "recruitment" || flowType === "recruitment_exemption") && userRole === 1) {
          prevRole = 0;
        } else if (flowType === "soc" && userRole === 2) {
          prevRole = 1;
        }

        await tx
          .update(userFlow)
          .set({ status: "ongoing" })
          .where(eq(userFlow.id, evalRecord.fkUserFlowId));

        if (prevRole !== userRole) {
          await tx
            .update(user)
            .set({ role: prevRole, updatedAt: new Date() })
            .where(eq(user.id, fkUserId));
        }
      }
    }
  });

  revalidatePath("/dashboard/approvals");
  revalidatePath("/dashboard/recruitment");
};

// Admin undoes a rejection, moving evaluation back to pending
export const reopenEvaluation = async (evaluationId: number) => {
  const session = await verifyRole(3);

  const [evalRecord] = await db
    .select({ status: interviewEvaluation.status })
    .from(interviewEvaluation)
    .where(eq(interviewEvaluation.id, evaluationId))
    .limit(1);

  if (!evalRecord) throw new Error("面评不存在");
  if (evalRecord.status !== "rejected") throw new Error("只能撤销已驳回的面评");

  await db
    .update(interviewEvaluation)
    .set({
      status: "pending",
      fkReviewedBy: null,
      updatedAt: new Date(),
    })
    .where(eq(interviewEvaluation.id, evaluationId));

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

  const result = await db
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

  return result;
};

// Get candidates in ongoing status for WOC/SOC/exemption flows
export const getEvaluationCandidates = async (flowId: number) => {
  await verifyRole(2);

  const result = await db
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
      eq(interviewEvaluation.fkUserFlowId, userFlow.id)
    )
    .where(
      and(
        eq(userFlow.fkFlowId, flowId),
        inArray(userFlow.status, ["ongoing", "rejected"]),
      )
    )
    .orderBy(user.studentId);

  return result;
};
