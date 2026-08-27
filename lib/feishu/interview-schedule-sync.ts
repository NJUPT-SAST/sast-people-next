import "server-only";

import { db } from "@/db/drizzle";
import { flow, interviewSchedule, userFlow } from "@/db/schema";
import { createRenderedEmailDelivery } from "@/lib/email-center/delivery";
import {
  getFeishuCalendarEvent,
  isFeishuEventNotFoundError,
} from "@/lib/feishu/interview-schedule";
import { getValidFeishuUserCredential } from "@/lib/feishu/oauth-account";
import { listPeopleUsersByLinkIds } from "@/lib/link/user-lookup";
import { writeOperationAudit } from "@/lib/operation-audit";
import { logServerError } from "@/lib/server-error-log";
import { and, eq, gte, lt } from "drizzle-orm";
import { revalidatePath } from "next/cache";

const DEFAULT_TIMEZONE = "Asia/Shanghai";

type FeishuCalendarEventChangedInput = {
  calendarEventId?: string;
  changeType?: string;
};

export async function syncInterviewScheduleFromFeishuEvent({
  calendarEventId,
  changeType,
}: FeishuCalendarEventChangedInput) {
  const eventId = calendarEventId?.trim();
  if (!eventId) return { synced: false as const, reason: "missing_event_id" as const };

  const [schedule] = await db
    .select({
      id: interviewSchedule.id,
      userFlowId: interviewSchedule.fkUserFlowId,
      organizerId: interviewSchedule.fkOrganizerId,
      providerCalendarId: interviewSchedule.providerCalendarId,
      attendeeEmail: interviewSchedule.attendeeEmail,
      summary: interviewSchedule.summary,
      description: interviewSchedule.description,
      location: interviewSchedule.location,
      meetingRoomId: interviewSchedule.meetingRoomId,
      startsAt: interviewSchedule.startsAt,
      endsAt: interviewSchedule.endsAt,
      meetingLink: interviewSchedule.meetingLink,
      scheduleLink: interviewSchedule.scheduleLink,
      providerMeetingId: interviewSchedule.providerMeetingId,
      providerMeetingNo: interviewSchedule.providerMeetingNo,
      updatedAt: interviewSchedule.updatedAt,
    })
    .from(interviewSchedule)
    .where(
      and(
        eq(interviewSchedule.providerEventId, eventId),
        eq(interviewSchedule.status, "created"),
      ),
    )
    .limit(1);
  if (!schedule) return { synced: false as const, reason: "schedule_not_found" as const };

  const [target] = await db
    .select({ candidateId: userFlow.fkUserId, flowId: flow.id, flowTitle: flow.title })
    .from(userFlow)
    .innerJoin(flow, eq(flow.id, userFlow.fkFlowId))
    .where(eq(userFlow.id, schedule.userFlowId))
    .limit(1);
  const userMap = target
    ? await listPeopleUsersByLinkIds([target.candidateId, schedule.organizerId], {
        canViewSensitiveInfo: true,
      })
    : new Map();

  const sendExternalChangeEmail = async (
    kind: "rescheduled" | "cancelled",
    startsAt: Date,
    endsAt: Date,
    location?: string | null,
  ) => {
    if (!target || !schedule.attendeeEmail) return;
    try {
      await createRenderedEmailDelivery({
        templateKey: `interview.schedule.${kind}`,
        toAddress: schedule.attendeeEmail,
        flowId: target.flowId,
        recipientUserId: target.candidateId,
        userFlowId: schedule.userFlowId,
        relatedScheduleId: schedule.id,
        createdBy: schedule.organizerId,
        variables: {
          candidateName: userMap.get(target.candidateId)?.name ?? "同学",
          flowName: target.flowTitle,
          organizerName: userMap.get(schedule.organizerId)?.name ?? "面试讲师",
          startsAt,
          endsAt,
          location,
        },
        metadata: { kind, flowId: target.flowId, source: "feishu_calendar_event" },
        sendImmediately: true,
      });
    } catch (error) {
      logServerError("interviewSchedule:externalChangeEmail", error, {
        action: "send-external-feishu-schedule-change-email",
        metadata: { scheduleId: schedule.id, kind },
      });
    }
  };

  const cancelSchedule = async (metadata: Record<string, unknown>) => {
    const [cancelled] = await db
      .update(interviewSchedule)
      .set({ status: "cancelled", updatedAt: new Date() })
      .where(
        and(
          eq(interviewSchedule.id, schedule.id),
          eq(interviewSchedule.status, "created"),
        ),
      )
      .returning({ id: interviewSchedule.id });
    if (!cancelled) return { synced: false as const, reason: "already_cancelled" as const };

    await sendExternalChangeEmail("cancelled", schedule.startsAt, schedule.endsAt, schedule.location);
    revalidatePath("/dashboard/interviews");
    await writeOperationAudit({
      actorId: schedule.organizerId,
      actorType: "provider",
      action: "interview_schedule.sync.cancelled",
      resourceType: "interview_schedule",
      resourceId: schedule.id,
      metadata: { provider: "feishu", providerEventId: eventId, ...metadata },
    });
    return { synced: true as const, status: "cancelled" as const };
  };

  if (changeType === "deleted") {
    return cancelSchedule({ changeType });
  }

  const credential = await getValidFeishuUserCredential(schedule.organizerId);
  let event: Awaited<ReturnType<typeof getFeishuCalendarEvent>>;
  try {
    event = await getFeishuCalendarEvent({
      accessToken: credential.accessToken,
      calendarId: schedule.providerCalendarId,
      eventId,
    });
  } catch (error) {
    if (!isFeishuEventNotFoundError(error)) throw error;
    return cancelSchedule({ reason: "event_not_found" });
  }

  if (event.status === "cancelled") {
    return cancelSchedule({ changeType });
  }

  const changed =
    event.startsAt.getTime() !== schedule.startsAt.getTime() ||
    event.endsAt.getTime() !== schedule.endsAt.getTime() ||
    (event.location ?? null) !== schedule.location ||
    (event.meetingRoomId ?? null) !== schedule.meetingRoomId ||
    (event.summary ?? schedule.summary) !== schedule.summary ||
    (event.meetingLink ?? "") !== schedule.meetingLink ||
    (event.scheduleLink ?? null) !== schedule.scheduleLink ||
    (event.meetingId ?? null) !== schedule.providerMeetingId ||
    (event.meetingNo ?? null) !== schedule.providerMeetingNo;
  if (!changed) return { synced: false as const, reason: "unchanged" as const };

  const meetingLink = event.meetingLink ?? "";
  const scheduleLink = event.scheduleLink ?? null;
  const meetingId = event.meetingId ?? null;
  const meetingNo = event.meetingNo ?? null;

  const [updated] = await db
    .update(interviewSchedule)
    .set({
      summary: event.summary ?? schedule.summary,
      description: event.description ?? schedule.description,
      location: event.location ?? null,
      meetingRoomId: event.meetingRoomId ?? null,
      startsAt: event.startsAt,
      endsAt: event.endsAt,
      timezone: event.timezone ?? DEFAULT_TIMEZONE,
      meetingLink,
      providerMeetingId: meetingId,
      providerMeetingNo: meetingNo,
      scheduleLink,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(interviewSchedule.id, schedule.id),
        eq(interviewSchedule.status, "created"),
        // PostgreSQL keeps microseconds while the pg driver exposes Date values
        // with millisecond precision. Match the original timestamp's millisecond
        // bucket so the optimistic lock remains valid without losing concurrency protection.
        gte(interviewSchedule.updatedAt, schedule.updatedAt),
        lt(interviewSchedule.updatedAt, new Date(schedule.updatedAt.getTime() + 1)),
      ),
    )
    .returning({ id: interviewSchedule.id });
  if (!updated) return { synced: false as const, reason: "stale_event" as const };
  await sendExternalChangeEmail("rescheduled", event.startsAt, event.endsAt, event.location);
  revalidatePath("/dashboard/interviews");
  await writeOperationAudit({
    actorId: schedule.organizerId,
    actorType: "provider",
    action: "interview_schedule.sync.updated",
    resourceType: "interview_schedule",
    resourceId: schedule.id,
    metadata: {
      provider: "feishu",
      providerEventId: eventId,
      oldStartsAt: schedule.startsAt.toISOString(),
      oldEndsAt: schedule.endsAt.toISOString(),
      startsAt: event.startsAt.toISOString(),
      endsAt: event.endsAt.toISOString(),
      changeType,
    },
  });

  return { synced: true as const, status: "updated" as const };
}
