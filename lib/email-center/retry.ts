import "server-only";

import { db } from "@/db/drizzle";
import { emailDelivery } from "@/db/schema";
import { getEmailRetryPolicy } from "@/lib/email-center/config";
import { sendEmailDelivery } from "@/lib/email-center/delivery";
import { logServerError } from "@/lib/server-error-log";
import { and, asc, eq, lte } from "drizzle-orm";

export async function retryDueEmailDeliveries({
  now = new Date(),
  limit,
}: {
  now?: Date;
  limit?: number;
} = {}) {
  const retryPolicy = getEmailRetryPolicy();
  const scanLimit = limit ?? retryPolicy.scanLimit;
  const dueDeliveries = await db
    .select({ id: emailDelivery.id })
    .from(emailDelivery)
    .where(
      and(
        eq(emailDelivery.status, "failed"),
        lte(emailDelivery.nextRetryAt, now),
      ),
    )
    .orderBy(asc(emailDelivery.nextRetryAt))
    .limit(scanLimit);

  const result = {
    scannedCount: dueDeliveries.length,
    retriedCount: 0,
    failedCount: 0,
  };

  for (const delivery of dueDeliveries) {
    try {
      await sendEmailDelivery(delivery.id, { trigger: "auto_retry" });
      result.retriedCount += 1;
    } catch (error) {
      result.failedCount += 1;
      logServerError("email:retryDueDelivery", error, {
        action: "retry-due-email-delivery",
        metadata: { deliveryId: delivery.id },
      });
    }
  }

  return result;
}
