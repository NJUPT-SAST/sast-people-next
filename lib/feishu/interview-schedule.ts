import "server-only";

import { getFeishuClient } from "@/lib/feishu/client";
import { logServerError } from "@/lib/server-error-log";

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

export type UpdateFeishuInterviewScheduleInput = {
  accessToken: string;
  organizerOpenId: string;
  eventId: string;
  reserveId?: string | null;
  currentMeetingLink: string;
  summary: string;
  description?: string;
  startsAt: Date;
  endsAt: Date;
  timezone?: string;
};

export type CancelFeishuInterviewScheduleInput = {
  accessToken: string;
  eventId?: string | null;
  reserveId?: string | null;
};

export type CreateFeishuMeetingMinuteInput = {
  accessToken: string;
  eventId: string;
};

const toFeishuTimestamp = (date: Date) =>
  Math.floor(date.getTime() / 1000).toString();

type FeishuFreebusyResponse = {
  code?: number;
  msg?: string;
  data?: {
    freebusy_list?: Array<{
      start_time?: string;
      end_time?: string;
    }>;
  };
};

function hasOverlap(startA: Date, endA: Date, startB: Date, endB: Date) {
  return startA < endB && startB < endA;
}

async function assertOrganizerIsAvailable({
  accessToken,
  organizerOpenId,
  startsAt,
  endsAt,
}: {
  accessToken: string;
  organizerOpenId: string;
  startsAt: Date;
  endsAt: Date;
}) {
  const client = getFeishuClient();
  let res: FeishuFreebusyResponse;

  try {
    res = await client.calendar.v4.freebusy.list(
      {
        data: {
          time_min: startsAt.toISOString(),
          time_max: endsAt.toISOString(),
          user_id: organizerOpenId,
          include_external_calendar: true,
          only_busy: true,
        },
        params: {
          user_id_type: "open_id",
        },
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    );
  } catch (error) {
    logServerError("feishu:freebusy", error, {
      action: "query-feishu-freebusy",
      metadata: {
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
      },
    });
    return;
  }

  if (res.code && res.code !== 0) {
    logServerError("feishu:freebusy", new Error(res.msg ?? String(res.code)), {
      action: "query-feishu-freebusy",
      metadata: {
        code: res.code,
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
      },
    });
    return;
  }

  const busyPeriods = res.data?.freebusy_list ?? [];
  const conflict = busyPeriods.some((item) => {
    const start = item.start_time ? new Date(item.start_time) : null;
    const end = item.end_time ? new Date(item.end_time) : null;
    if (!start || !end) return false;
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return false;
    }
    return hasOverlap(startsAt, endsAt, start, end);
  });

  if (conflict) {
    throw new Error("讲师该时间段已有飞书日程，请改约后再发起面试。");
  }
}

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

  await assertOrganizerIsAvailable({
    accessToken,
    organizerOpenId,
    startsAt,
    endsAt,
  });

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

export async function updateFeishuInterviewSchedule({
  accessToken,
  organizerOpenId,
  eventId,
  reserveId,
  currentMeetingLink,
  summary,
  description,
  startsAt,
  endsAt,
  timezone = DEFAULT_TIMEZONE,
}: UpdateFeishuInterviewScheduleInput): Promise<CreatedFeishuInterviewSchedule> {
  const client = getFeishuClient();
  const authOptions = {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  };

  let meetingLink = currentMeetingLink;
  let meetingNo: string | undefined;

  if (reserveId) {
    const reserveRes = await client.vc.v1.reserve.update(
      {
        path: {
          reserve_id: reserveId,
        },
        params: {
          user_id_type: "open_id",
        },
        data: {
          end_time: toFeishuTimestamp(endsAt),
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
      },
      authOptions,
    );

    if (reserveRes.code && reserveRes.code !== 0) {
      throw new Error(`update feishu meeting failed: ${reserveRes.msg ?? reserveRes.code}`);
    }

    const reserve = reserveRes.data?.reserve;
    meetingLink = reserve?.url ?? meetingLink;
    meetingNo = reserve?.meeting_no;
  }

  const eventRes = await client.calendar.v4.calendarEvent.patch(
    {
      path: {
        calendar_id: "primary",
        event_id: eventId,
      },
      params: {
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

  if (eventRes.code && eventRes.code !== 0) {
    throw new Error(`update feishu calendar event failed: ${eventRes.msg ?? eventRes.code}`);
  }

  return {
    eventId,
    reserveId: reserveId ?? undefined,
    meetingNo,
    meetingLink,
  };
}

export async function cancelFeishuInterviewSchedule({
  accessToken,
  eventId,
  reserveId,
}: CancelFeishuInterviewScheduleInput) {
  const client = getFeishuClient();
  const authOptions = {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  };

  if (eventId) {
    const eventRes = await client.calendar.v4.calendarEvent.delete(
      {
        path: {
          calendar_id: "primary",
          event_id: eventId,
        },
        params: {
          need_notification: "true",
        },
      },
      authOptions,
    );

    if (eventRes.code && eventRes.code !== 0) {
      throw new Error(`delete feishu calendar event failed: ${eventRes.msg ?? eventRes.code}`);
    }
  }

  if (reserveId) {
    const reserveRes = await client.vc.v1.reserve.delete(
      {
        path: {
          reserve_id: reserveId,
        },
      },
      authOptions,
    );

    if (reserveRes.code && reserveRes.code !== 0) {
      throw new Error(`delete feishu meeting failed: ${reserveRes.msg ?? reserveRes.code}`);
    }
  }
}

export async function createFeishuMeetingMinute({
  accessToken,
  eventId,
}: CreateFeishuMeetingMinuteInput) {
  const res = await getFeishuClient().calendar.v4.calendarEventMeetingMinute.create(
    {
      path: {
        calendar_id: "primary",
        event_id: eventId,
      },
    },
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );

  if (res.code && res.code !== 0) {
    throw new Error(`create feishu meeting minute failed: ${res.msg ?? res.code}`);
  }

  const docUrl = res.data?.doc_url;
  if (!docUrl) {
    throw new Error("create feishu meeting minute failed: doc_url is empty");
  }

  return { docUrl };
}
