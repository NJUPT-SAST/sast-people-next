"use server";

import { verifyRole } from "@/lib/dal";
import {
  recoverStaleEmailBatchById,
  sendEmailBatchById,
} from "@/lib/email-center/batch";
import { writeOperationAudit } from "@/lib/operation-audit";
import { logServerError } from "@/lib/server-error-log";

export async function sendEmailBatch(batchId: number) {
  let session: Awaited<ReturnType<typeof verifyRole>> | null = null;

  try {
    session = await verifyRole(3);
    const result = await sendEmailBatchById(batchId);

    await writeOperationAudit({
      actorId: session.uid,
      action: "email.batch_send",
      resourceType: "email_batch",
      resourceId: batchId,
      metadata: {
        queuedCount: result.queuedCount,
      },
    });

    return result;
  } catch (error) {
    logServerError("email:sendBatch", error, {
      path: "/dashboard/emails",
      userId: session?.uid ?? null,
      role: session?.role ?? null,
      action: "send-email-batch",
      metadata: { batchId },
    });
    throw error;
  }
}

export async function recoverStaleEmailBatch(batchId: number) {
  let session: Awaited<ReturnType<typeof verifyRole>> | null = null;

  try {
    session = await verifyRole(3);
    const result = await recoverStaleEmailBatchById(batchId);

    await writeOperationAudit({
      actorId: session.uid,
      action: "email.recover_stale",
      resourceType: "email_batch",
      resourceId: batchId,
      metadata: { recoveredCount: result.recoveredCount },
    });

    return result;
  } catch (error) {
    logServerError("email:recoverStaleBatch", error, {
      path: "/dashboard/emails",
      userId: session?.uid ?? null,
      role: session?.role ?? null,
      action: "recover-stale-email-batch",
      metadata: { batchId },
    });
    throw error;
  }
}
