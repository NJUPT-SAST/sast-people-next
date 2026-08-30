import "server-only";

import { db } from "@/db/drizzle";
import { interviewSchedule } from "@/db/schema";
import { cancelFeishuInterviewSchedule } from "@/lib/feishu/interview-schedule";
import { getValidFeishuUserCredential } from "@/lib/feishu/oauth-account";
import { eq } from "drizzle-orm";
import { mqClient } from "./client";

type InterviewScheduleCancellationEvent = {
  scheduleId: number;
};

export const interviewScheduleCancellation = mqClient.createFunction(
  {
    id: "step/interview.schedule.cancel",
    triggers: [{ event: "interview/schedule.cancel" }],
  },
  async ({ event, step }) => {
    const data = event.data as InterviewScheduleCancellationEvent;
    const schedule = await step.run("load-cancelled-schedule", async () => {
      const [row] = await db
        .select({
          id: interviewSchedule.id,
          organizerId: interviewSchedule.fkOrganizerId,
          providerCalendarId: interviewSchedule.providerCalendarId,
          providerEventId: interviewSchedule.providerEventId,
          providerReserveId: interviewSchedule.providerReserveId,
          status: interviewSchedule.status,
        })
        .from(interviewSchedule)
        .where(eq(interviewSchedule.id, data.scheduleId))
        .limit(1);

      return row ?? null;
    });

    if (!schedule || schedule.status !== "cancelled") {
      return { skipped: "schedule-not-cancelled" };
    }

    await step.run("cancel-feishu-schedule", async () => {
      const credential = await getValidFeishuUserCredential(schedule.organizerId);
      await cancelFeishuInterviewSchedule({
        accessToken: credential.accessToken,
        calendarId: schedule.providerCalendarId,
        eventId: schedule.providerEventId,
        reserveId: schedule.providerReserveId,
      });
    });

    return { cancelled: true, scheduleId: schedule.id };
  },
);
