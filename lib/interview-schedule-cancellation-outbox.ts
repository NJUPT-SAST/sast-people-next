import "server-only";

import { db } from "@/db/drizzle";
import { interviewScheduleCancellationOutbox } from "@/db/schema";
import { logServerError } from "@/lib/server-error-log";
import { mqClient } from "@/queue/client";
import { and, eq, isNull, sql } from "drizzle-orm";

const BATCH_SIZE = 20;
const LOCK_DURATION_MS = 5 * 60 * 1000;
const MAX_RETRY_DELAY_MS = 60 * 60 * 1000;

function retryAt(attemptCount: number, now: Date) {
  const delay = Math.min(
    2 ** Math.max(0, attemptCount - 1) * 60_000,
    MAX_RETRY_DELAY_MS,
  );
  return new Date(now.getTime() + delay);
}

function errorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.slice(0, 4_000);
}

export async function dispatchInterviewScheduleCancellationOutbox() {
  const claimedAt = new Date();
  const claimed = await db
    .update(interviewScheduleCancellationOutbox)
    .set({
      lockedUntil: new Date(claimedAt.getTime() + LOCK_DURATION_MS),
      updatedAt: claimedAt,
    })
    .where(sql`${interviewScheduleCancellationOutbox.id} IN (
      SELECT ${interviewScheduleCancellationOutbox.id}
      FROM ${interviewScheduleCancellationOutbox}
      WHERE ${interviewScheduleCancellationOutbox.publishedAt} IS NULL
        AND ${interviewScheduleCancellationOutbox.nextAttemptAt} <= now()
        AND (
          ${interviewScheduleCancellationOutbox.lockedUntil} IS NULL
          OR ${interviewScheduleCancellationOutbox.lockedUntil} < now()
        )
      ORDER BY ${interviewScheduleCancellationOutbox.nextAttemptAt}
      LIMIT ${BATCH_SIZE}
      FOR UPDATE SKIP LOCKED
    )`)
    .returning({
      id: interviewScheduleCancellationOutbox.id,
      scheduleId: interviewScheduleCancellationOutbox.fkInterviewScheduleId,
      attemptCount: interviewScheduleCancellationOutbox.attemptCount,
    });

  let published = 0;
  let failed = 0;
  for (const record of claimed) {
    const attemptedAt = new Date();
    try {
      await mqClient.send({
        name: "interview/schedule.cancel",
        data: { scheduleId: record.scheduleId },
        id: `people-interview-cancellation-outbox-${record.id}`,
      });
      await db
        .update(interviewScheduleCancellationOutbox)
        .set({
          attemptCount: sql`${interviewScheduleCancellationOutbox.attemptCount} + 1`,
          lastAttemptAt: attemptedAt,
          lastError: null,
          lockedUntil: null,
          publishedAt: attemptedAt,
          updatedAt: attemptedAt,
        })
        .where(
          and(
            eq(interviewScheduleCancellationOutbox.id, record.id),
            isNull(interviewScheduleCancellationOutbox.publishedAt),
          ),
        );
      published += 1;
    } catch (error) {
      failed += 1;
      const nextAttemptCount = record.attemptCount + 1;
      await db
        .update(interviewScheduleCancellationOutbox)
        .set({
          attemptCount: sql`${interviewScheduleCancellationOutbox.attemptCount} + 1`,
          lastAttemptAt: attemptedAt,
          lastError: errorMessage(error),
          lockedUntil: null,
          nextAttemptAt: retryAt(nextAttemptCount, attemptedAt),
          updatedAt: attemptedAt,
        })
        .where(
          and(
            eq(interviewScheduleCancellationOutbox.id, record.id),
            isNull(interviewScheduleCancellationOutbox.publishedAt),
          ),
        );
      logServerError("queue:interviewCancellationOutbox", error, {
        action: "dispatch-interview-schedule-cancellation",
        metadata: { outboxId: record.id, scheduleId: record.scheduleId },
      });
    }
  }

  return { claimed: claimed.length, published, failed };
}
