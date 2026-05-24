"use server";

import { db } from "@/db/drizzle";
import { flow, interviewEvaluation, user, userFlow } from "@/db/schema";
import { verifyRole } from "@/lib/dal";
import { aliasedTable, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

export const createEvaluation = async (userFlowId: number, content: string) => {
  const session = await verifyRole(2);

  if (!content.trim()) {
    return { success: false, error: { message: "面评内容不能为空" } };
  }

  const [evaluation] = await db
    .insert(interviewEvaluation)
    .values({
      fkUserFlowId: userFlowId,
      fkUserId: session.uid,
      content: content.trim(),
      status: "pending",
    })
    .returning();

  revalidatePath("/dashboard/manage");
  return { success: true, data: evaluation };
};

export const approveEvaluation = async (evaluationId: number) => {
  const session = await verifyRole(3);

  await db
    .update(interviewEvaluation)
    .set({
      status: "approved",
      fkReviewedBy: session.uid,
      updatedAt: new Date(),
    })
    .where(eq(interviewEvaluation.id, evaluationId));

  revalidatePath("/dashboard/manage");
};

export const rejectEvaluation = async (evaluationId: number) => {
  const session = await verifyRole(3);

  await db
    .update(interviewEvaluation)
    .set({
      status: "rejected",
      fkReviewedBy: session.uid,
      updatedAt: new Date(),
    })
    .where(eq(interviewEvaluation.id, evaluationId));

  revalidatePath("/dashboard/manage");
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
