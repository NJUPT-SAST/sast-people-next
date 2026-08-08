import { db } from "@/db/drizzle";
import { interviewEvaluation, interviewSchedule } from "@/db/schema";
import { getFeishuMinuteInfo } from "@/lib/feishu/interview-schedule";
import {
  getMeetingCalendarEventId,
  getMeetingEndedAt,
  getMeetingId,
  getMinuteSourceEntityId,
  getMinuteTitle,
  getMinuteToken,
  getMinuteUrl,
  type FeishuMeetingEndedEvent,
  type FeishuMinuteGeneratedEvent,
} from "@/lib/feishu/interview-event";
import { sendInterviewMinuteCard } from "@/lib/feishu/interview-message";
import { getValidFeishuUserCredential } from "@/lib/feishu/oauth-account";
import { writeOperationAudit } from "@/lib/operation-audit";
import { logServerError } from "@/lib/server-error-log";
import * as lark from "@larksuiteoapi/node-sdk";
import { and, desc, eq, inArray, isNull, or } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

type FeishuUrlVerificationPayload = {
  type?: string;
  token?: string;
  challenge?: string;
};

let dispatcher: lark.EventDispatcher | null = null;

function getEventDispatcher() {
  if (!dispatcher) {
    dispatcher = new lark.EventDispatcher({
      verificationToken: process.env.FEISHU_EVENT_VERIFICATION_TOKEN,
      encryptKey: process.env.FEISHU_EVENT_ENCRYPT_KEY,
    });

    dispatcher.register({
      "vc.meeting.meeting_ended_v1": handleMeetingEnded,
      "vc.meeting.all_meeting_ended_v1": handleMeetingEnded,
      "vc.meeting.participant_meeting_ended_v1": handleMeetingEnded,
      "minutes.minute.generated_v1": handleMinuteGenerated,
    } as lark.EventHandles);
  }

  return dispatcher;
}

async function handleMeetingEnded(event: FeishuMeetingEndedEvent) {
  const calendarEventId = getMeetingCalendarEventId(event);
  const meetingId = getMeetingId(event);
  if (!calendarEventId && !meetingId) return;

  const scheduleMatch = calendarEventId && meetingId
    ? or(
        eq(interviewSchedule.providerEventId, calendarEventId),
        eq(interviewSchedule.providerMeetingId, meetingId),
      )
    : calendarEventId
      ? eq(interviewSchedule.providerEventId, calendarEventId)
      : eq(interviewSchedule.providerMeetingId, meetingId as string);

  const [schedule] = await db
    .select({
      id: interviewSchedule.id,
      userFlowId: interviewSchedule.fkUserFlowId,
      organizerId: interviewSchedule.fkOrganizerId,
      providerEventId: interviewSchedule.providerEventId,
      providerMeetingId: interviewSchedule.providerMeetingId,
    })
    .from(interviewSchedule)
    .where(
      and(
        scheduleMatch,
        eq(interviewSchedule.status, "created"),
      ),
    )
    .limit(1);

  if (!schedule) return;

  const [updatedSchedule] = await db
    .update(interviewSchedule)
    .set({
      meetingStatus: "ended",
      meetingEndedAt: getMeetingEndedAt(event),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(interviewSchedule.id, schedule.id),
        eq(interviewSchedule.meetingStatus, "scheduled"),
      ),
    )
    .returning({ id: interviewSchedule.id });

  if (!updatedSchedule) return;

  await writeOperationAudit({
    actorId: schedule.organizerId,
    action: "interview_schedule.meeting.ended",
    resourceType: "interview_schedule",
    resourceId: schedule.id,
    metadata: {
      userFlowId: schedule.userFlowId,
      provider: "feishu",
      providerEventId: schedule.providerEventId,
      providerMeetingId: schedule.providerMeetingId,
      feishuEventId: event.event_id,
      feishuEventType: event.event_type,
    },
  });
}

async function handleMinuteGenerated(event: FeishuMinuteGeneratedEvent) {
  const sourceEntityId = getMinuteSourceEntityId(event);
  if (!sourceEntityId) return;

  const [schedule] = await db
    .select({
      id: interviewSchedule.id,
      userFlowId: interviewSchedule.fkUserFlowId,
      organizerId: interviewSchedule.fkOrganizerId,
      providerEventId: interviewSchedule.providerEventId,
      providerReserveId: interviewSchedule.providerReserveId,
      providerMeetingId: interviewSchedule.providerMeetingId,
      providerMeetingNo: interviewSchedule.providerMeetingNo,
      evaluationId: interviewSchedule.fkEvaluationId,
    })
    .from(interviewSchedule)
    .where(
      and(
        eq(interviewSchedule.status, "created"),
        or(
          eq(interviewSchedule.providerEventId, sourceEntityId),
          eq(interviewSchedule.providerReserveId, sourceEntityId),
          eq(interviewSchedule.providerMeetingId, sourceEntityId),
          eq(interviewSchedule.providerMeetingNo, sourceEntityId),
        ),
      ),
    )
    .limit(1);

  if (!schedule) return;

  const minuteToken = getMinuteToken(event);
  let minuteUrl = getMinuteUrl(event);
  let minuteTitle = getMinuteTitle(event);

  if (minuteToken) {
    const credential = await getValidFeishuUserCredential(schedule.organizerId);
    const minute = await getFeishuMinuteInfo({
      accessToken: credential.accessToken,
      minuteToken,
    });
    minuteUrl = minute.url;
    minuteTitle = minuteTitle ?? minute.title ?? null;
  }

  if (!minuteUrl) {
    logServerError("api:feishu:events", new Error("minute generated event has no minute url"), {
      action: "handle-feishu-minute-generated",
      metadata: {
        scheduleId: schedule.id,
        sourceEntityId,
        minuteToken,
      },
    });
    return;
  }

  const [updatedSchedule] = await db
    .update(interviewSchedule)
    .set({
      meetingMinuteLink: minuteUrl,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(interviewSchedule.id, schedule.id),
        isNull(interviewSchedule.meetingMinuteLink),
      ),
    )
    .returning({ id: interviewSchedule.id });

  if (!updatedSchedule) return;

  let evaluationId = schedule.evaluationId;
  if (!evaluationId) {
    const [evaluation] = await db
      .select({ id: interviewEvaluation.id })
      .from(interviewEvaluation)
      .where(
        and(
          eq(interviewEvaluation.fkUserFlowId, schedule.userFlowId),
          isNull(interviewEvaluation.meetingLink),
          inArray(interviewEvaluation.status, ["submitted", "approved"]),
        ),
      )
      .orderBy(desc(interviewEvaluation.id))
      .limit(1);
    evaluationId = evaluation?.id ?? null;
  }
  if (evaluationId) {
    await db
      .update(interviewEvaluation)
      .set({ meetingLink: minuteUrl, updatedAt: new Date() })
      .where(
        and(
          eq(interviewEvaluation.id, evaluationId),
          isNull(interviewEvaluation.meetingLink),
        ),
      );
  }

  await writeOperationAudit({
    actorId: schedule.organizerId,
    action: "interview_schedule.meeting_minute.generated",
    resourceType: "interview_schedule",
    resourceId: schedule.id,
    metadata: {
      userFlowId: schedule.userFlowId,
      provider: "feishu",
      providerEventId: schedule.providerEventId,
      providerReserveId: schedule.providerReserveId,
      providerMeetingId: schedule.providerMeetingId,
      providerMeetingNo: schedule.providerMeetingNo,
      sourceEntityId,
      feishuEventId: event.event_id,
      feishuEventType: event.event_type,
      minuteToken,
      minuteTitle,
      evaluationId,
    },
  });

  try {
    const credential = await getValidFeishuUserCredential(schedule.organizerId);
    await sendInterviewMinuteCard({
      openId: credential.openId,
      scheduleId: schedule.id,
      minuteUrl,
      minuteTitle,
    });
  } catch (error) {
    logServerError("api:feishu:events", error, {
      action: "notify-feishu-minute-generated",
      metadata: {
        scheduleId: schedule.id,
      },
    });
  }
}

export async function POST(request: NextRequest) {
  try {
    const payload = (await request.json()) as FeishuUrlVerificationPayload;
    const verificationToken = process.env.FEISHU_EVENT_VERIFICATION_TOKEN;
    if (!verificationToken) {
      logServerError(
        "api:feishu:events",
        new Error("FEISHU_EVENT_VERIFICATION_TOKEN is required"),
        { path: request.nextUrl.pathname, method: request.method },
      );
      return NextResponse.json({ message: "feishu event verification is not configured" }, { status: 503 });
    }

    if (payload.type === "url_verification") {
      if (payload.token !== verificationToken) {
        return NextResponse.json({ message: "invalid token" }, { status: 401 });
      }

      return NextResponse.json({ challenge: payload.challenge });
    }

    const eventData = {
      ...payload,
      headers: Object.fromEntries(request.headers.entries()),
    };
    const { isChallenge, challenge } = lark.generateChallenge(eventData, {
      encryptKey: process.env.FEISHU_EVENT_ENCRYPT_KEY ?? "",
    });
    if (isChallenge) {
      return NextResponse.json(challenge);
    }

    const result = await getEventDispatcher().invoke(eventData);
    return NextResponse.json(result ?? { ok: true });
  } catch (error) {
    logServerError("api:feishu:events", error, {
      path: request.nextUrl.pathname,
      method: request.method,
      action: "handle-feishu-event",
    });
    return NextResponse.json({ message: "handle feishu event failed" }, { status: 500 });
  }
}
