"use server";
import { db } from "@/db/drizzle";
import { userFlow } from "@/db/schema";
import event from "@/event";
import { verifyRole } from "@/lib/dal";
import { logServerError } from "@/lib/server-error-log";
import { and, eq, inArray } from "drizzle-orm";
import { syncUserRoleFromAcceptedFlows } from "@/action/user-flow/roleTransition";

export const batchSendEmail = async (
  uid: number[],
  flowId: number,
  accept: boolean
) => {
  let session: Awaited<ReturnType<typeof verifyRole>> | null = null;

  try {
    session = await verifyRole(3)
    const sourceStatus = accept ? "passed" : "failed";
    const finalStatus = accept ? "accepted" : "rejected";

    const userFlowIds = (
      await db
        .select()
        .from(userFlow)
        .where(
          and(
            eq(userFlow.fkFlowId, flowId),
            inArray(userFlow.fkUserId, uid),
            eq(userFlow.status, sourceStatus),
          )
        )
    );

    await Promise.all(userFlowIds.map((item) => event.offer(item.id, accept)));

    if (userFlowIds.length > 0) {
      await db
        .update(userFlow)
        .set({ status: finalStatus })
        .where(inArray(userFlow.id, userFlowIds.map((item) => item.id)));

      await Promise.all(
        userFlowIds.map((item) => syncUserRoleFromAcceptedFlows(item.fkUserId)),
      );
    }
  } catch (error) {
    logServerError("email:batchSend", error, {
      path: "/dashboard/review",
      userId: session?.uid ?? null,
      role: session?.role ?? null,
      action: accept ? "send-acceptance-email" : "send-rejection-email",
      flowId,
      metadata: {
        targetUserIds: uid,
        accept,
      },
    });
    throw error;
  }
};
