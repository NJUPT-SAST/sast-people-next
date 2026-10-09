"use server";

import { db } from "@/db/drizzle";
import { flowStep, userFlow } from "@/db/schema";
import { and, asc, eq, isNull, or } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { verifySession, type VerifiedSession } from "@/lib/dal";
import { logServerError } from "@/lib/server-error-log";
import { writeOperationAudit } from "@/lib/operation-audit";
import { assertFlowResultsEditable } from "@/lib/flow-result-publication-guard";

export const unregister = async (userFlowId: number) => {
  let session: VerifiedSession | null = null;

  try {
    session = await verifySession();
    const uid = session.uid;

    /**
     * 校验与删除必须原子：只在「还停在第一步（报名）」时删除。
     * 删条件直接写在 `delete` 的 where 里（当前步骤 = 流程第一步，或未记录当前步骤），
     * 于是步骤推进与删除由同一行的行锁定序——先校验后删除之间的竞态窗口不存在。
     */
    const outcome = await db.transaction(async (tx) => {
      const [record] = await tx
        .select({
          id: userFlow.id,
          fkUserId: userFlow.fkUserId,
          flowId: userFlow.fkFlowId,
          department: userFlow.department,
        })
        .from(userFlow)
        .where(eq(userFlow.id, userFlowId))
        .limit(1);

      if (!record || record.fkUserId !== uid) {
        return { kind: "forbidden" as const };
      }

      await assertFlowResultsEditable(record.flowId);

      const [firstStep] = await tx
        .select({ id: flowStep.id })
        .from(flowStep)
        .where(
          and(eq(flowStep.fkFlowId, record.flowId), eq(flowStep.isDeleted, false)),
        )
        .orderBy(asc(flowStep.order))
        .limit(1);

      const deleted = await tx
        .delete(userFlow)
        .where(
          and(
            eq(userFlow.id, userFlowId),
            firstStep
              ? or(
                  isNull(userFlow.fkCurrentStepId),
                  eq(userFlow.fkCurrentStepId, firstStep.id),
                )
              : undefined,
          ),
        );

      if ((deleted.rowCount ?? 0) !== 1) {
        return { kind: "progressed" as const };
      }
      return { kind: "ok" as const, record };
    });

    if (outcome.kind === "forbidden") {
      return { success: false, error: { message: "无权操作" } };
    }
    if (outcome.kind === "progressed") {
      return { success: false, error: { message: "流程已推进，无法取消报名" } };
    }

    await writeOperationAudit({
      actorId: uid,
      actorRole: session.realRole,
      action: "user_flow.unregister",
      resourceType: "user_flow",
      resourceId: userFlowId,
      department: outcome.record.department,
      metadata: {
        flowId: outcome.record.flowId,
        targetUserId: uid,
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
