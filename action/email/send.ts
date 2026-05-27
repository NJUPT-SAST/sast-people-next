"use server";

import { syncUserRoleFromAcceptedFlows } from "@/action/user-flow/roleTransition";
import { db } from "@/db/drizzle";
import { emailBatch, emailDelivery, userFlow } from "@/db/schema";
import event from "@/event";
import { verifyRole } from "@/lib/dal";
import { logServerError } from "@/lib/server-error-log";
import { eq, inArray } from "drizzle-orm";

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

    const finalStatus = batch.accept ? "accepted" : "rejected";

    await db
      .update(emailDelivery)
      .set({ status: "pending", errorMessage: null })
      .where(
        inArray(
          emailDelivery.id,
          queueableDeliveries.map((item) => item.id),
        ),
      );

    await db
      .update(emailBatch)
      .set({ status: "queued" })
      .where(eq(emailBatch.id, batchId));

    await db
      .update(userFlow)
      .set({ status: finalStatus })
      .where(
        inArray(
          userFlow.id,
          queueableDeliveries.map((item) => item.userFlowId),
        ),
      );

    await Promise.all(
      queueableDeliveries.map((item) => syncUserRoleFromAcceptedFlows(item.userId)),
    );

    await Promise.all(queueableDeliveries.map((item) => event.offer(item.id)));

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

