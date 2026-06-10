import "server-only";

import { getEmailRetryPolicy } from "@/lib/email-center/config";

export function getNextEmailRetryAt({
  attemptCount,
  now = new Date(),
}: {
  attemptCount: number;
  now?: Date;
}) {
  const retryPolicy = getEmailRetryPolicy();
  const exponent = Math.max(0, attemptCount - 1);
  const delaySeconds = Math.min(
    retryPolicy.maxDelaySeconds,
    retryPolicy.baseDelaySeconds * 2 ** exponent,
  );

  return new Date(now.getTime() + delaySeconds * 1000);
}

export function getFailedDeliveryRetryState({
  attemptCount,
  now = new Date(),
}: {
  attemptCount: number;
  now?: Date;
}) {
  const retryPolicy = getEmailRetryPolicy();
  const shouldDeadLetter = attemptCount >= retryPolicy.maxAttempts;

  return {
    status: shouldDeadLetter ? "dead" : "failed",
    nextRetryAt: shouldDeadLetter
      ? null
      : getNextEmailRetryAt({ attemptCount, now }),
    deadLetteredAt: shouldDeadLetter ? now : null,
  } as const;
}
