import { db } from "@/db/drizzle";
import { interviewSchedule } from "@/db/schema";
import { getFeishuMinuteInfo } from "@/lib/feishu/interview-schedule";
import { sendInterviewMinuteCard } from "@/lib/feishu/interview-message";
import { getValidFeishuUserCredential } from "@/lib/feishu/oauth-account";
import { writeOperationAudit } from "@/lib/operation-audit";
import { logServerError } from "@/lib/server-error-log";
import * as lark from "@larksuiteoapi/node-sdk";
import { and, eq, or } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

type FeishuMeetingEndedEvent = {
  event_id?: string;
  event_type?: string;
  meeting?: {
    calendar_event_id?: string;
  };
};

type FeishuMinuteGeneratedEvent = {
  event_id?: string;
  event_type?: string;
  minute_token?: string;
  title?: string;
  url?: string;
  minute?: {
    token?: string;
    minute_token?: string;
    title?: string;
    url?: string;
    minute_source?: {
      source_entity_id?: string;
    };
    source_entity_id?: string;
  };
  minute_source?: {
    source_entity_id?: string;
  };
};

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
      "minutes.minute.generated_v1": handleMinuteGenerated,
    } as lark.EventHandles);
  }

  return dispatcher;
}

function getMinuteToken(event: FeishuMinuteGeneratedEvent) {
  return event.minute_token ?? event.minute?.minute_token ?? event.minute?.token ?? null;
}

function getMinuteTitle(event: FeishuMinuteGeneratedEvent) {
  return event.title ?? event.minute?.title ?? null;
}

function getMinuteUrl(event: FeishuMinuteGeneratedEvent) {
  return event.url ?? event.minute?.url ?? null;
}

function getMinuteSourceEntityId(event: FeishuMinuteGeneratedEvent) {
  return (
    event.minute_source?.source_entity_id ??
    event.minute?.minute_source?.source_entity_id ??
    event.minute?.source_entity_id ??
    null
  );
}

async function handleMeetingEnded(event: FeishuMeetingEndedEvent) {
  const calendarEventId = event.meeting?.calendar_event_id;
  if (!calendarEventId) return;

  const [schedule] = await db
    .select({
      id: interviewSchedule.id,
      userFlowId: interviewSchedule.fkUserFlowId,
      organizerId: interviewSchedule.fkOrganizerId,
      providerEventId: interviewSchedule.providerEventId,
    })
    .from(interviewSchedule)
    .where(
      and(
        eq(interviewSchedule.providerEventId, calendarEventId),
        eq(interviewSchedule.status, "created"),
      ),
    )
    .limit(1);

  if (!schedule) return;

  await writeOperationAudit({
    actorId: schedule.organizerId,
    action: "interview_schedule.meeting.ended",
    resourceType: "interview_schedule",
    resourceId: schedule.id,
    metadata: {
      userFlowId: schedule.userFlowId,
      provider: "feishu",
      providerEventId: calendarEventId,
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
      providerMeetingNo: interviewSchedule.providerMeetingNo,
    })
    .from(interviewSchedule)
    .where(
      and(
        eq(interviewSchedule.status, "created"),
        or(
          eq(interviewSchedule.providerEventId, sourceEntityId),
          eq(interviewSchedule.providerReserveId, sourceEntityId),
          eq(interviewSchedule.providerMeetingNo, sourceEntityId),
        ),
      ),
    )
    .limit(1);

  if (!schedule) return;

  const minuteToken = getMinuteToken(event);
  let minuteUrl = getMinuteUrl(event);
  let minuteTitle = getMinuteTitle(event);

  if (!minuteUrl && minuteToken) {
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

  await db
    .update(interviewSchedule)
    .set({
      meetingMinuteLink: minuteUrl,
      updatedAt: new Date(),
    })
    .where(eq(interviewSchedule.id, schedule.id));

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
      providerMeetingNo: schedule.providerMeetingNo,
      sourceEntityId,
      feishuEventId: event.event_id,
      feishuEventType: event.event_type,
      minuteToken,
      minuteTitle,
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
    if (payload.type === "url_verification") {
      if (
        process.env.FEISHU_EVENT_VERIFICATION_TOKEN &&
        payload.token !== process.env.FEISHU_EVENT_VERIFICATION_TOKEN
      ) {
        return NextResponse.json({ message: "invalid token" }, { status: 401 });
      }

      return NextResponse.json({ challenge: payload.challenge });
    }

    const result = await getEventDispatcher().invoke(payload);
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
