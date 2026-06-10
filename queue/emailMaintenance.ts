import "server-only";

import {
  deleteOldEmailDeliveryAttempts,
  deleteOldEmailRateLimitBuckets,
} from "@/lib/email-center/attempt-retention";
import { retryDueEmailDeliveries } from "@/lib/email-center/retry";
import { logServerError } from "@/lib/server-error-log";
import { mqClient } from "./client";

export const retryDueEmailDeliveriesJob = mqClient.createFunction(
  {
    id: "email/retry.due",
    triggers: [{ cron: "*/5 * * * *" }],
  },
  async ({ step }) => {
    return step.run("retry-due-email-deliveries", async () => {
      try {
        return await retryDueEmailDeliveries();
      } catch (error) {
        logServerError("queue:emailRetryDue", error, {
          action: "retry-due-email-deliveries",
        });
        throw error;
      }
    });
  },
);

export const cleanupEmailDeliveryAttemptsJob = mqClient.createFunction(
  {
    id: "email/attempt.cleanup",
    triggers: [{ cron: "0 3 * * *" }],
  },
  async ({ step }) => {
    return step.run("delete-old-email-delivery-attempts", async () => {
      try {
        const attempts = await deleteOldEmailDeliveryAttempts();
        const rateLimitBuckets = await deleteOldEmailRateLimitBuckets();
        return { attempts, rateLimitBuckets };
      } catch (error) {
        logServerError("queue:emailAttemptCleanup", error, {
          action: "delete-old-email-delivery-attempts",
        });
        throw error;
      }
    });
  },
);
