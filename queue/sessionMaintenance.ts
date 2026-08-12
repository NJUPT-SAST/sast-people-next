import "server-only";

import { deleteExpiredSessions } from "@/lib/session";
import { logServerError } from "@/lib/server-error-log";
import { mqClient } from "./client";

export const cleanupExpiredSessionsJob = mqClient.createFunction(
  {
    id: "session/expired.cleanup",
    triggers: [{ cron: "15 3 * * *" }],
  },
  async ({ step }) => {
    return step.run("delete-expired-sessions", async () => {
      try {
        return { deletedCount: await deleteExpiredSessions() };
      } catch (error) {
        logServerError("queue:expiredSessionCleanup", error, {
          action: "delete-expired-sessions",
        });
        throw error;
      }
    });
  },
);
