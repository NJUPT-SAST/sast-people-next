"use server";
import { verifyRole } from "@/lib/dal";
import { createResultEmailBatch } from "@/lib/email-center/batch";
import { writeOperationAudit } from "@/lib/operation-audit";
import { logServerError } from "@/lib/server-error-log";

export const batchSendEmail = async (
  uid: number[],
  flowId: number,
  accept: boolean
) => {
  let session: Awaited<ReturnType<typeof verifyRole>> | null = null;

  try {
    session = await verifyRole(3)
    const actorId = session.uid;
    const result = await createResultEmailBatch({
      userIds: uid,
      flowId,
      accept,
      createdBy: actorId,
    });

    if (result.batchId) {
      await writeOperationAudit({
        actorId,
        action: "email.batch.create",
        resourceType: "email_batch",
        resourceId: result.batchId,
        metadata: {
          flowId,
          accept,
          targetUserCount: uid.length,
          deliveryCount: result.deliveryCount,
        },
      });
    }

    return result;
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
