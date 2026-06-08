"use server";

import { db } from "@/db/drizzle";
import { emailDelivery } from "@/db/schema";
import { verifyRole } from "@/lib/dal";
import { requirePositiveIntegerInput } from "@/lib/email-center/action-input";
import { sendEmailDelivery } from "@/lib/email-center/delivery";
import { writeOperationAudit } from "@/lib/operation-audit";
import { logServerError } from "@/lib/server-error-log";
import { eq } from "drizzle-orm";

export async function retryEmailDelivery(deliveryIdInput: unknown) {
  let session: Awaited<ReturnType<typeof verifyRole>> | null = null;
  let deliveryId: number | null = null;

  try {
    session = await verifyRole(3);
    deliveryId = requirePositiveIntegerInput(deliveryIdInput, "邮件记录 ID");

    const [delivery] = await db
      .select({
        id: emailDelivery.id,
        status: emailDelivery.status,
      })
      .from(emailDelivery)
      .where(eq(emailDelivery.id, deliveryId))
      .limit(1);

    if (!delivery) {
      throw new Error("Email delivery not found");
    }
    if (delivery.status === "sent") {
      return { messageId: null, skipped: true };
    }

    const result = await sendEmailDelivery(delivery.id, {
      trigger: "manual_retry",
      triggeredBy: session.uid,
    });

    await writeOperationAudit({
      actorId: session.uid,
      action: "email.delivery_retry",
      resourceType: "email_delivery",
      resourceId: delivery.id,
      metadata: { previousStatus: delivery.status },
    });

    return { messageId: result.messageId, skipped: false };
  } catch (error) {
    logServerError("email:retryDelivery", error, {
      path: "/dashboard/emails",
      userId: session?.uid ?? null,
      role: session?.role ?? null,
      action: "retry-email-delivery",
      metadata: { deliveryId },
    });
    throw error;
  }
}
