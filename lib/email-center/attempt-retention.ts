import "server-only";

import { db } from "@/db/drizzle";
import { emailDeliveryAttempt, emailSendRateLimit } from "@/db/schema";
import { getEmailAttemptRetentionDays } from "@/lib/email-center/config";
import { lt } from "drizzle-orm";

const DAY_MS = 24 * 60 * 60 * 1000;

export async function deleteOldEmailDeliveryAttempts({
  now = new Date(),
  retentionDays = getEmailAttemptRetentionDays(),
}: {
  now?: Date;
  retentionDays?: number;
} = {}) {
  const cutoff = new Date(now.getTime() - retentionDays * DAY_MS);
  const deletedRows = await db
    .delete(emailDeliveryAttempt)
    .where(lt(emailDeliveryAttempt.startedAt, cutoff))
    .returning({ id: emailDeliveryAttempt.id });

  return {
    deletedCount: deletedRows.length,
    cutoff,
    retentionDays,
  };
}

export async function deleteOldEmailRateLimitBuckets({
  now = new Date(),
  retentionDays = 2,
}: {
  now?: Date;
  retentionDays?: number;
} = {}) {
  const cutoff = new Date(now.getTime() - retentionDays * DAY_MS);
  const deletedRows = await db
    .delete(emailSendRateLimit)
    .where(lt(emailSendRateLimit.windowStart, cutoff))
    .returning({ bucketKey: emailSendRateLimit.bucketKey });

  return {
    deletedCount: deletedRows.length,
    cutoff,
    retentionDays,
  };
}
