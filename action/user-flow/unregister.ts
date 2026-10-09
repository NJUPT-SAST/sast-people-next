"use server";

import { db } from "@/db/drizzle";
import { flowStep, userFlow } from "@/db/schema";
import { and, asc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { verifySession } from "@/lib/dal";
import { logServerError } from "@/lib/server-error-log";
import { writeOperationAudit } from "@/lib/operation-audit";
import { assertFlowResultsEditable } from "@/lib/flow-result-publication-guard";

export const unregister = async (userFlowId: number) => {
  let session: Awaited<ReturnType<typeof verifySession>> | null = null;

  try {
    session = await verifySession();

    const record = await db
      .select({
        id: userFlow.id,
        fkUserId: userFlow.fkUserId,
        flowId: userFlow.fkFlowId,
        department: userFlow.department,
        currentStepOrder: flowStep.order,
      })
      .from(userFlow)
      .leftJoin(flowStep, eq(userFlow.fkCurrentStepId, flowStep.id))
      .where(eq(userFlow.id, userFlowId))
      .limit(1);

    if (!record[0] || record[0].fkUserId !== session.uid) {
      return { success: false, error: { message: "无权操作" } };
    }

    /* 取消报名只允许「还停在第一步（报名）」的报名：
       后面任何一步结束（候选人已经进流程）之后就不该再一键退出（界面也不再显示按钮）。 */
    const [firstStep] = await db
      .select({ order: flowStep.order })
      .from(flowStep)
      .where(and(eq(flowStep.fkFlowId, record[0].flowId), eq(flowStep.isDeleted, false)))
      .orderBy(asc(flowStep.order))
      .limit(1);
    const currentStepOrder = record[0].currentStepOrder;
    if (firstStep && currentStepOrder !== null && currentStepOrder > firstStep.order) {
      return { success: false, error: { message: "流程已推进，无法取消报名" } };
    }

    await assertFlowResultsEditable(record[0].flowId);

    await db.delete(userFlow).where(eq(userFlow.id, userFlowId));
    await writeOperationAudit({
      actorId: session.uid,
      actorRole: session.realRole,
      action: "user_flow.unregister",
      resourceType: "user_flow",
      resourceId: userFlowId,
      department: record[0].department,
      metadata: {
        flowId: record[0].flowId,
        targetUserId: session.uid,
      },
    });
    revalidatePath("/user-flow");
    return { success: true };
  } catch (error) {
    logServerError("user-flow:unregister", error, {
      path: "/dashboard/user-flow",
      userId: session?.uid ?? null,
      role: session?.role ?? null,
      action: "unregister-flow",
      userFlowId,
    });
    throw error;
  }
};
