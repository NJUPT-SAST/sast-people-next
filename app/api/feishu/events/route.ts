import { db } from "@/db/drizzle";
import { interviewEvaluation, interviewSchedule } from "@/db/schema";
import { createFeishuMeetingMinute } from "@/lib/feishu/interview-schedule";
import { getValidFeishuUserCredential } from "@/lib/feishu/oauth-account";
import { writeOperationAudit } from "@/lib/operation-audit";
import { logServerError } from "@/lib/server-error-log";
import * as lark from "@larksuiteoapi/node-sdk";
import { and, eq, isNull } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

type FeishuMeetingEndedEvent = {
  event_id?: string;
  event_type?: string;
  meeting?: {
    calendar_event_id?: string;
  };
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
    });
  }

  return dispatcher;
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
      meetingMinuteLink: interviewSchedule.meetingMinuteLink,
    })
    .from(interviewSchedule)
    .where(
      and(
        eq(interviewSchedule.providerEventId, calendarEventId),
        eq(interviewSchedule.status, "created"),
      ),
    )
    .limit(1);

  if (!schedule || schedule.meetingMinuteLink) return;

  const credential = await getValidFeishuUserCredential(schedule.organizerId);
  const result = await createFeishuMeetingMinute({
    accessToken: credential.accessToken,
    eventId: calendarEventId,
  });

  await db
    .update(interviewSchedule)
    .set({
      meetingMinuteLink: result.docUrl,
      updatedAt: new Date(),
    })
    .where(eq(interviewSchedule.id, schedule.id));

  await db
    .update(interviewEvaluation)
    .set({
      meetingLink: result.docUrl,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(interviewEvaluation.fkUserFlowId, schedule.userFlowId),
        isNull(interviewEvaluation.meetingLink),
      ),
    );

  await writeOperationAudit({
    actorId: schedule.organizerId,
    action: "interview_schedule.meeting_minute.auto_create",
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

export async function POST(request: NextRequest) {
  try {
    const payload = await request.json();
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
