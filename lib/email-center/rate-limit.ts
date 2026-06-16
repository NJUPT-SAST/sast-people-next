import "server-only";

import { db } from "@/db/drizzle";
import { emailSendRateLimit } from "@/db/schema";
import { getEmailSendRateLimitPerMinute } from "@/lib/email-center/config";
import { lt, sql } from "drizzle-orm";

export type EmailRateLimitClaim = {
  allowed: boolean;
  limit: number;
  bucketKey: string;
  count: number | null;
  retryAfterSeconds: number;
};

function getMinuteBucketStart(now: Date) {
  return new Date(Math.floor(now.getTime() / 60_000) * 60_000);
}

function getRetryAfterSeconds(now: Date) {
  const nextMinute = getMinuteBucketStart(
    new Date(now.getTime() + 60_000),
  ).getTime();
  return Math.max(1, Math.ceil((nextMinute - now.getTime()) / 1000));
}

export async function claimEmailSendRateLimit({
  now = new Date(),
}: {
  now?: Date;
} = {}): Promise<EmailRateLimitClaim> {
  const limit = getEmailSendRateLimitPerMinute();
  const bucketStart = getMinuteBucketStart(now);
  const bucketKey = `smtp:${bucketStart.toISOString()}`;

  const [claim] = await db
    .insert(emailSendRateLimit)
    .values({
      bucketKey,
      windowStart: bucketStart,
      count: 1,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: emailSendRateLimit.bucketKey,
      set: {
        count: sql`${emailSendRateLimit.count} + 1`,
        updatedAt: now,
      },
      where: lt(emailSendRateLimit.count, limit),
    })
    .returning({ count: emailSendRateLimit.count });

  return {
    allowed: Boolean(claim),
    limit,
    bucketKey,
    count: claim?.count ?? null,
    retryAfterSeconds: getRetryAfterSeconds(now),
  };
}

export async function assertEmailSendRateLimit() {
  const claim = await claimEmailSendRateLimit();

  if (!claim.allowed) {
    throw new Error(
      `邮件发送速率已达到上限（${claim.limit}/分钟），请等待约 ${claim.retryAfterSeconds} 秒后重试。`,
    );
  }

  return claim;
}
