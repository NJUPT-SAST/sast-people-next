"use server";

import { syncUserRoleFromAcceptedFlows } from "@/action/user-flow/roleTransition";
import { db } from "@/db/drizzle";
import { emailBatch, emailDelivery, userFlow } from "@/db/schema";
import event from "@/event";
import { verifyRole } from "@/lib/dal";
import { writeOperationAudit } from "@/lib/operation-audit";
import { logServerError } from "@/lib/server-error-log";
import { sendDelivery } from "@/queue/sendEmail";
import { and, eq, inArray, lt } from "drizzle-orm";

const EMAIL_SERVICE_UNAVAILABLE =
  "邮件发送服务未启动或未配置，请检查 Inngest 邮件队列和 EMAIL_PASSWORD。";
const STALE_SENDING_DELIVERY_MINUTES = 10;

export async function sendEmailBatch(batchId: number) {
  let session: Awaited<ReturnType<typeof verifyRole>> | null = null;

  try {
    session = await verifyRole(3);

    const [batch] = await db
      .select()
      .from(emailBatch)
      .where(eq(emailBatch.id, batchId))
      .limit(1);

    if (!batch) {
      throw new Error("Email batch not found");
    }
    if (batch.status === "completed") {
      return { queuedCount: 0 };
    }

    const deliveries = await db
      .select({
        id: emailDelivery.id,
        userFlowId: emailDelivery.fkUserFlowId,
        userId: emailDelivery.fkUserId,
        status: emailDelivery.status,
      })
      .from(emailDelivery)
      .where(eq(emailDelivery.fkEmailBatchId, batchId));

    const queueableDeliveries = deliveries.filter(
      (item) => item.status === "pending" || item.status === "failed",
    );

    if (queueableDeliveries.length === 0) {
      return { queuedCount: 0 };
    }

    const finalStatus = batch.accept ? "passed" : "failed";

    await db
      .update(emailDelivery)
      .set({ status: "pending", errorMessage: null, updatedAt: new Date() })
      .where(
        inArray(
          emailDelivery.id,
          queueableDeliveries.map((item) => item.id),
        ),
      );

    await db
      .update(emailBatch)
      .set({ status: "queued", updatedAt: new Date() })
      .where(eq(emailBatch.id, batchId));

    const userFlowIds = queueableDeliveries
      .map((item) => item.userFlowId)
      .filter((id): id is number => id !== null);

    if (userFlowIds.length > 0) {
      await db
        .update(userFlow)
        .set({ progressStatus: finalStatus, updatedAt: new Date() })
        .where(inArray(userFlow.id, userFlowIds));
    }

    await Promise.all(
      queueableDeliveries.map((item) => syncUserRoleFromAcceptedFlows(item.userId)),
    );

    try {
      await Promise.all(
        queueableDeliveries.map(async (item) => {
          try {
            await event.offer(item.id);
          } catch (_error) {
            if (!process.env.EMAIL_PASSWORD) {
              await db
                .update(emailDelivery)
                .set({
                  status: "failed",
                  errorMessage: EMAIL_SERVICE_UNAVAILABLE,
                  updatedAt: new Date(),
                })
                .where(eq(emailDelivery.id, item.id));
              throw new Error(EMAIL_SERVICE_UNAVAILABLE);
            }

            await sendDelivery(item.id);
          }
        }),
      );
    } catch (error) {
      await db
        .update(emailBatch)
        .set({ status: "failed", updatedAt: new Date() })
        .where(eq(emailBatch.id, batchId));
      throw error;
    }

    await writeOperationAudit({
      actorId: session.uid,
      action: "email.batch_send",
      resourceType: "email_batch",
      resourceId: batchId,
      metadata: {
        queuedCount: queueableDeliveries.length,
        accept: batch.accept,
      },
    });

    return { queuedCount: queueableDeliveries.length };
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

    const cutoff = new Date(
      Date.now() - STALE_SENDING_DELIVERY_MINUTES * 60 * 1000,
    );
    const staleDeliveries = await db
      .select({ id: emailDelivery.id })
      .from(emailDelivery)
      .where(
        and(
          eq(emailDelivery.fkEmailBatchId, batchId),
          eq(emailDelivery.status, "sending"),
          lt(emailDelivery.updatedAt, cutoff),
        ),
      );

    if (staleDeliveries.length === 0) {
      return { recoveredCount: 0 };
    }

    await db
      .update(emailDelivery)
      .set({
        status: "failed",
        errorMessage: "发送任务可能已中断，请确认后重试。",
        updatedAt: new Date(),
      })
      .where(
        inArray(
          emailDelivery.id,
          staleDeliveries.map((item) => item.id),
        ),
      );

    await db
      .update(emailBatch)
      .set({ status: "failed", updatedAt: new Date() })
      .where(eq(emailBatch.id, batchId));

    await writeOperationAudit({
      actorId: session.uid,
      action: "email.recover_stale",
      resourceType: "email_batch",
      resourceId: batchId,
      metadata: { recoveredCount: staleDeliveries.length },
    });

    return { recoveredCount: staleDeliveries.length };
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
