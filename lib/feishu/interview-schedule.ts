import "server-only";

import { getFeishuClient } from "@/lib/feishu/client";

const DEFAULT_TIMEZONE = "Asia/Shanghai";

export type CreateFeishuInterviewScheduleInput = {
  accessToken: string;
  organizerOpenId: string;
  summary: string;
  description?: string;
  startsAt: Date;
  endsAt: Date;
  attendeeEmail?: string | null;
  timezone?: string;
  idempotencyKey: string;
};

export type CreatedFeishuInterviewSchedule = {
  eventId: string;
  reserveId?: string;
  meetingNo?: string;
  meetingLink: string;
};

const toFeishuTimestamp = (date: Date) =>
  Math.floor(date.getTime() / 1000).toString();

export async function createFeishuInterviewSchedule({
  accessToken,
  organizerOpenId,
  summary,
  description,
  startsAt,
  endsAt,
  attendeeEmail,
  timezone = DEFAULT_TIMEZONE,
  idempotencyKey,
}: CreateFeishuInterviewScheduleInput): Promise<CreatedFeishuInterviewSchedule> {
  const client = getFeishuClient();
  const authOptions = {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  };

  const reserveRes = await client.vc.v1.reserve.apply(
    {
      data: {
        end_time: toFeishuTimestamp(endsAt),
        owner_id: organizerOpenId,
        meeting_settings: {
          topic: summary,
          meeting_initial_type: 1,
          meeting_connect: true,
          assign_host_list: [
            {
              user_type: 1,
              id: organizerOpenId,
            },
          ],
        },
      },
      params: {
        user_id_type: "open_id",
      },
    },
    authOptions,
  );

  const reserve = reserveRes.data?.reserve;
  const meetingLink = reserve?.url ?? reserve?.app_link;
  if (!meetingLink) {
    throw new Error(`create feishu meeting failed: ${reserveRes.msg ?? reserveRes.code ?? "unknown"}`);
  }

  const eventRes = await client.calendar.v4.calendarEvent.create(
    {
      path: {
        calendar_id: "primary",
      },
      params: {
        idempotency_key: idempotencyKey,
        user_id_type: "open_id",
      },
      data: {
        summary,
        description,
        need_notification: true,
        start_time: {
          timestamp: toFeishuTimestamp(startsAt),
          timezone,
        },
        end_time: {
          timestamp: toFeishuTimestamp(endsAt),
          timezone,
        },
        attendee_ability: "none",
        free_busy_status: "busy",
        reminders: [{ minutes: 15 }],
        vchat: {
          vc_type: "third_party_meeting",
          icon_type: "vc",
          meeting_url: meetingLink,
          description: "飞书会议",
        },
      },
    },
    authOptions,
  );

  const event = eventRes.data?.event;
  if (!event?.event_id) {
    throw new Error(`create feishu calendar event failed: ${eventRes.msg ?? eventRes.code ?? "unknown"}`);
  }

  if (attendeeEmail) {
    await client.calendar.v4.calendarEventAttendee.create(
      {
        path: {
          calendar_id: "primary",
          event_id: event.event_id,
        },
        params: {
          user_id_type: "open_id",
        },
        data: {
          need_notification: true,
          attendees: [
            {
              type: "third_party",
              third_party_email: attendeeEmail,
            },
          ],
        },
      },
      authOptions,
    );
  }

  return {
    eventId: event.event_id,
    reserveId: reserve?.id,
    meetingNo: reserve?.meeting_no,
    meetingLink,
  };
}
