import "server-only";

import { db } from "@/db/drizzle";
import { interviewEvaluation } from "@/db/schema";
import { buildFeishuApprovalReminderCard } from "@/lib/feishu/approval-notification";
import { sendFeishuCardMessage } from "@/lib/feishu/message";
import { logServerError } from "@/lib/server-error-log";
import { eq } from "drizzle-orm";
import { mqClient } from "./client";

const APPROVAL_REMINDER_DELAY = "1h";

export type ApprovalReminderEventData = {
  evaluationId: number;
  candidateName: string;
  flowTitle: string;
  submittedAt: string;
};

async function sendPendingApprovalReminder(data: ApprovalReminderEventData) {
  const [evaluation] = await db
    .select({ status: interviewEvaluation.status })
    .from(interviewEvaluation)
    .where(eq(interviewEvaluation.id, data.evaluationId))
    .limit(1);

  if (!evaluation || evaluation.status !== "submitted") {
    return { skipped: "not-pending" };
  }

  const chatId = process.env.FEISHU_APPROVAL_CHAT_ID?.trim();
  if (!chatId) return { skipped: "not-configured" };

  const submittedAt = new Date(data.submittedAt);
  if (Number.isNaN(submittedAt.getTime())) return { skipped: "invalid-submission-time" };

  await sendFeishuCardMessage({
    receiveId: chatId,
    receiveIdType: "chat_id",
    card: buildFeishuApprovalReminderCard({
      candidateName: data.candidateName,
      flowTitle: data.flowTitle,
      submittedAt,
    }),
    uuid: `people-approval-reminder-${data.evaluationId}`,
  });

  return { notified: true };
}

export const approvalReminder = mqClient.createFunction(
  {
    id: "approval/evaluation.reminder",
    triggers: [{ event: "approval/evaluation.reminder" }],
  },
  async ({ event, step }) => {
    const data = event.data as ApprovalReminderEventData;

    await step.sleep("wait-before-reminder", APPROVAL_REMINDER_DELAY);

    return step.run("notify-pending-approval", async () => {
      try {
        return await sendPendingApprovalReminder(data);
      } catch (error) {
        logServerError("queue:approvalReminder", error, {
          action: "notify-pending-approval",
          metadata: data,
        });
        throw error;
      }
    });
  },
);
