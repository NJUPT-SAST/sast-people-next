import "server-only";

import { db } from "@/db/drizzle";
import { flow, interviewEvaluation, interviewSchedule, userFlow } from "@/db/schema";
import { sendInterviewScheduleCard } from "@/lib/feishu/interview-message";
import { getValidFeishuUserCredential } from "@/lib/feishu/oauth-account";
import { listPeopleUsersByLinkIds } from "@/lib/link/user-lookup";
import { logServerError } from "@/lib/server-error-log";
import { and, eq } from "drizzle-orm";
import { mqClient } from "./client";

const BEFORE_START_REMINDER_MS = 30 * 60 * 1000;
const AFTER_END_EVALUATION_REMINDER_MS = 10 * 60 * 1000;

type ReminderEventData = {
  scheduleId: number;
  startsAt: string;
  endsAt: string;
};

async function loadScheduleContext(scheduleId: number) {
  const [row] = await db
    .select({
      scheduleId: interviewSchedule.id,
      userFlowId: interviewSchedule.fkUserFlowId,
      organizerId: interviewSchedule.fkOrganizerId,
      candidateId: userFlow.fkUserId,
      flowName: flow.title,
      startsAt: interviewSchedule.startsAt,
      endsAt: interviewSchedule.endsAt,
      meetingLink: interviewSchedule.meetingLink,
      scheduleLink: interviewSchedule.scheduleLink,
      status: interviewSchedule.status,
    })
    .from(interviewSchedule)
    .innerJoin(userFlow, eq(userFlow.id, interviewSchedule.fkUserFlowId))
    .innerJoin(flow, eq(flow.id, userFlow.fkFlowId))
    .where(eq(interviewSchedule.id, scheduleId))
    .limit(1);

  if (!row) return null;

  const userMap = await listPeopleUsersByLinkIds(
    [row.candidateId, row.organizerId],
    { canViewSensitiveInfo: true },
  );
  const candidate = userMap.get(row.candidateId);

  return {
    ...row,
    candidateName: candidate?.name ?? "同学",
    candidateStudentId: candidate?.studentId ?? null,
    candidateQq: candidate?.qq ?? null,
  };
}

function isSameScheduleTime(
  schedule: { startsAt: Date; endsAt: Date },
  eventData: ReminderEventData,
) {
  return (
    schedule.startsAt.getTime() === new Date(eventData.startsAt).getTime() &&
    schedule.endsAt.getTime() === new Date(eventData.endsAt).getTime()
  );
}

async function sendBeforeStartReminder(eventData: ReminderEventData) {
  const schedule = await loadScheduleContext(Number(eventData.scheduleId));
  if (!schedule || schedule.status !== "created") return { skipped: "not-active" };
  if (!isSameScheduleTime(schedule, eventData)) return { skipped: "rescheduled" };
  if (Date.now() > schedule.endsAt.getTime()) return { skipped: "ended" };

  const credential = await getValidFeishuUserCredential(schedule.organizerId);
  await sendInterviewScheduleCard({
    openId: credential.openId,
    title: "线下面试即将开始",
    flowName: schedule.flowName,
    candidateName: schedule.candidateName,
    candidateStudentId: schedule.candidateStudentId,
    candidateQq: schedule.candidateQq,
    startsAt: schedule.startsAt,
    endsAt: schedule.endsAt,
    meetingLink: schedule.meetingLink,
    scheduleLink: schedule.scheduleLink,
    userFlowId: schedule.userFlowId,
    scheduleId: schedule.scheduleId,
    uuidSuffix: `before-${schedule.startsAt.getTime()}`,
  });

  return { notified: true };
}

async function sendPendingEvaluationReminder(eventData: ReminderEventData) {
  const schedule = await loadScheduleContext(Number(eventData.scheduleId));
  if (!schedule || schedule.status !== "created") return { skipped: "not-active" };
  if (!isSameScheduleTime(schedule, eventData)) return { skipped: "rescheduled" };
  if (Date.now() < schedule.endsAt.getTime()) return { skipped: "not-ended" };

  const [evaluation] = await db
    .select({ id: interviewEvaluation.id })
    .from(interviewEvaluation)
    .where(
      and(
        eq(interviewEvaluation.fkUserFlowId, schedule.userFlowId),
        eq(interviewEvaluation.fkUserId, schedule.organizerId),
      ),
    )
    .limit(1);
  if (evaluation) return { skipped: "already-submitted" };

  const credential = await getValidFeishuUserCredential(schedule.organizerId);
  await sendInterviewScheduleCard({
    openId: credential.openId,
    title: "面评待提交",
    flowName: schedule.flowName,
    candidateName: schedule.candidateName,
    candidateStudentId: schedule.candidateStudentId,
    candidateQq: schedule.candidateQq,
    startsAt: schedule.startsAt,
    endsAt: schedule.endsAt,
    meetingLink: schedule.meetingLink,
    scheduleLink: schedule.scheduleLink,
    userFlowId: schedule.userFlowId,
    scheduleId: schedule.scheduleId,
    uuidSuffix: `pending-${schedule.endsAt.getTime()}`,
  });

  return { notified: true };
}

export const interviewScheduleReminder = mqClient.createFunction(
  {
    id: "step/interview.schedule.reminder",
    triggers: [{ event: "interview/schedule.reminder" }],
  },
  async ({ event, step }) => {
    const data = event.data as ReminderEventData;
    const startsAt = new Date(data.startsAt);
    const endsAt = new Date(data.endsAt);

    if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
      return { skipped: "invalid-time" };
    }

    const beforeStartAt = new Date(startsAt.getTime() - BEFORE_START_REMINDER_MS);
    if (beforeStartAt.getTime() > Date.now()) {
      await step.sleepUntil("wait-before-start", beforeStartAt);
    }

    const beforeResult = await step.run("notify-before-start", async () => {
      try {
        return await sendBeforeStartReminder(data);
      } catch (error) {
        logServerError("queue:interviewScheduleReminder", error, {
          action: "notify-before-start",
          metadata: data,
        });
        throw error;
      }
    });

    const afterEndAt = new Date(endsAt.getTime() + AFTER_END_EVALUATION_REMINDER_MS);
    if (afterEndAt.getTime() > Date.now()) {
      await step.sleepUntil("wait-after-end", afterEndAt);
    }

    const pendingResult = await step.run("notify-pending-evaluation", async () => {
      try {
        return await sendPendingEvaluationReminder(data);
      } catch (error) {
        logServerError("queue:interviewScheduleReminder", error, {
          action: "notify-pending-evaluation",
          metadata: data,
        });
        throw error;
      }
    });

    return {
      beforeResult,
      pendingResult,
    };
  },
);
