import "server-only";

import { getFeishuClient } from "@/lib/feishu/client";
import { logServerError } from "@/lib/server-error-log";
import * as lark from "@larksuiteoapi/node-sdk";

const DEFAULT_TIMEZONE = "Asia/Shanghai";

export type CreateFeishuInterviewScheduleInput = {
  accessToken: string;
  organizerOpenId: string;
  summary: string;
  description?: string;
  location?: string | null;
  startsAt: Date;
  endsAt: Date;
  attendeeOpenId?: string | null;
  timezone?: string;
  idempotencyKey: string;
};

export type CreatedFeishuInterviewSchedule = {
  eventId: string;
  reserveId?: string;
  meetingId?: string;
  meetingNo?: string;
  meetingLink: string;
  scheduleLink?: string;
};

export type UpdateFeishuInterviewScheduleInput = {
  accessToken: string;
  organizerOpenId: string;
  eventId: string;
  reserveId?: string | null;
  currentMeetingLink: string;
  summary: string;
  description?: string;
  location?: string | null;
  startsAt: Date;
  endsAt: Date;
  attendeeOpenId?: string | null;
  timezone?: string;
};

export type CancelFeishuInterviewScheduleInput = {
  accessToken: string;
  eventId?: string | null;
  reserveId?: string | null;
};

export type GetFeishuMinuteInfoInput = {
  accessToken: string;
  minuteToken: string;
};

export type FeishuMinuteInfo = {
  token?: string;
  ownerId?: string;
  createTime?: string;
  title?: string;
  cover?: string;
  duration?: string;
  url: string;
  noteId?: string;
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

function getFeishuErrorPayload(error: unknown) {
  if (!error || typeof error !== "object") return null;
  const response = "response" in error
    ? (error as { response?: { data?: unknown } }).response
    : null;
  const data = response?.data;
  return data && typeof data === "object"
    ? data as { code?: number; msg?: string }
    : null;
}

export function isFeishuEventNotFoundError(error: unknown) {
  const payload = getFeishuErrorPayload(error);
  return payload?.code === 193001 || payload?.msg === "event not found";
}

export function isFeishuInternalServiceError(error: unknown) {
  const payload = getFeishuErrorPayload(error);
  return payload?.code === 190003 || payload?.msg === "internal service error";
}

function logFeishuErrorToConsole(action: string, error: unknown) {
  if (process.env.NODE_ENV === "production") return;
  const payload = getFeishuErrorPayload(error);
  console.error(action, payload ?? error);
}

function hasOverlap(startA: Date, endA: Date, startB: Date, endB: Date) {
  return startA < endB && startB < endA;
}

function normalizeMobile(value: string) {
  return value.replace(/[^\d+]/g, "");
}

export async function getFeishuOpenIdByMobile(mobile: string) {
  const normalizedMobile = normalizeMobile(mobile);
  if (!normalizedMobile) return null;

  try {
    const res = await getFeishuClient().contact.v3.user.batchGetId({
      params: {
        user_id_type: "open_id",
      },
      data: {
        mobiles: [normalizedMobile],
      },
    });

    if (res.code && res.code !== 0) {
      throw new Error(`get feishu user id by mobile failed: ${res.msg ?? res.code}`);
    }

    return res.data?.user_list?.find((item) => item.mobile === normalizedMobile)?.user_id
      ?? res.data?.user_list?.[0]?.user_id
      ?? null;
  } catch (error) {
    logServerError("feishu:contactUser", error, {
      action: "get-feishu-open-id-by-mobile",
      metadata: {
        hasMobile: Boolean(normalizedMobile),
      },
    });
    return null;
  }
}

async function addFeishuCalendarUserAttendees({
  accessToken,
  eventId,
  openIds,
}: {
  accessToken: string;
  eventId: string;
  openIds: Array<string | null | undefined>;
}) {
  const attendees = Array.from(new Set(openIds.filter((id): id is string => Boolean(id))))
    .map((userId) => ({
      type: "user" as const,
      user_id: userId,
    }));
  if (attendees.length === 0) return;

  try {
    await getFeishuClient().calendar.v4.calendarEventAttendee.create(
      {
        path: {
          calendar_id: "primary",
          event_id: eventId,
        },
        params: {
          user_id_type: "open_id",
        },
        data: {
          need_notification: true,
          attendees,
        },
      },
      lark.withUserAccessToken(accessToken),
    );
  } catch (error) {
    logServerError("feishu:calendarEventAttendee", error, {
      action: "create-feishu-calendar-user-attendees",
      metadata: {
        eventId,
        attendeeCount: attendees.length,
      },
    });
  }
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
      lark.withUserAccessToken(accessToken),
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
  location,
  startsAt,
  endsAt,
  attendeeOpenId,
  timezone = DEFAULT_TIMEZONE,
  idempotencyKey,
}: CreateFeishuInterviewScheduleInput): Promise<CreatedFeishuInterviewSchedule> {
  const client = getFeishuClient();
  const authOptions = lark.withUserAccessToken(accessToken);

  await assertOrganizerIsAvailable({
    accessToken,
    organizerOpenId,
    startsAt,
    endsAt,
  });

  const eventPayload = {
    path: {
      calendar_id: "primary",
    },
    params: {
      idempotency_key: idempotencyKey,
      user_id_type: "open_id" as const,
    },
    data: {
      summary,
      description: [
        description,
        location ? `地点：${location}` : null,
      ].filter(Boolean).join("\n") || undefined,
      location: location ? { name: location } : undefined,
      need_notification: true,
      start_time: {
        timestamp: toFeishuTimestamp(startsAt),
        timezone,
      },
      end_time: {
        timestamp: toFeishuTimestamp(endsAt),
        timezone,
      },
      attendee_ability: "none" as const,
      free_busy_status: "busy" as const,
      reminders: [{ minutes: 15 }],
      vchat: {
        vc_type: "vc" as const,
        icon_type: "vc" as const,
        description: "飞书会议",
      },
    },
  };

  let eventRes: Awaited<ReturnType<typeof client.calendar.v4.calendarEvent.create>>;
  try {
    eventRes = await client.calendar.v4.calendarEvent.create(eventPayload, authOptions);
  } catch (error) {
    logFeishuErrorToConsole("create-feishu-calendar-event failed", error);
    throw error;
  }

  const event = eventRes.data?.event;
  if (!event?.event_id) {
    throw new Error(`create feishu calendar event failed: ${eventRes.msg ?? eventRes.code ?? "unknown"}`);
  }
  const meetingLink = event.vchat?.meeting_url;
  if (!meetingLink) {
    throw new Error("飞书日程已创建，但没有返回会议链接。请检查飞书日历会议能力是否已开通。");
  }
  await addFeishuCalendarUserAttendees({
    accessToken,
    eventId: event.event_id,
    openIds: [organizerOpenId, attendeeOpenId],
  });

  return {
    eventId: event.event_id,
    meetingId: event.vchat?.vc_info?.unique_id,
    meetingNo: event.vchat?.vc_info?.meeting_no,
    meetingLink,
    scheduleLink: event.app_link,
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
  location,
  startsAt,
  endsAt,
  attendeeOpenId,
  timezone = DEFAULT_TIMEZONE,
}: UpdateFeishuInterviewScheduleInput): Promise<CreatedFeishuInterviewSchedule> {
  const client = getFeishuClient();
  const authOptions = lark.withUserAccessToken(accessToken);

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

  const eventDescription = [
    description,
    location ? `地点：${location}` : null,
    `飞书会议：${meetingLink}`,
  ].filter(Boolean).join("\n");
  const eventData = {
    summary,
    description: eventDescription,
    location: location ? { name: location } : undefined,
    need_notification: true,
    start_time: {
      timestamp: toFeishuTimestamp(startsAt),
      timezone,
    },
    end_time: {
      timestamp: toFeishuTimestamp(endsAt),
      timezone,
    },
    ...(!reserveId
      ? {
          vchat: {
            vc_type: "vc" as const,
            icon_type: "vc" as const,
            description: "飞书会议",
          },
        }
      : {}),
  };

  let eventRes: Awaited<ReturnType<typeof client.calendar.v4.calendarEvent.patch>>;
  try {
    eventRes = await client.calendar.v4.calendarEvent.patch(
      {
        path: {
          calendar_id: "primary",
          event_id: eventId,
        },
        params: {
          user_id_type: "open_id",
        },
        data: eventData,
      },
      authOptions,
    );
  } catch (error) {
    logFeishuErrorToConsole("update-feishu-calendar-event failed", error);
    throw error;
  }

  if (eventRes.code && eventRes.code !== 0) {
    throw new Error(`update feishu calendar event failed: ${eventRes.msg ?? eventRes.code}`);
  }

  meetingLink = reserveId
    ? meetingLink
    : eventRes.data?.event?.vchat?.meeting_url ?? meetingLink;
  if (!meetingLink) {
    throw new Error("飞书日程已更新，但没有返回会议链接。请检查飞书日历会议能力是否已开通。");
  }

  await addFeishuCalendarUserAttendees({
    accessToken,
    eventId,
    openIds: [organizerOpenId, attendeeOpenId],
  });

  return {
    eventId,
    reserveId: reserveId ?? undefined,
    meetingId: eventRes.data?.event?.vchat?.vc_info?.unique_id,
    meetingNo: meetingNo ?? eventRes.data?.event?.vchat?.vc_info?.meeting_no,
    meetingLink,
    scheduleLink: eventRes.data?.event?.app_link,
  };
}

export async function cancelFeishuInterviewSchedule({
  accessToken,
  eventId,
  reserveId,
}: CancelFeishuInterviewScheduleInput) {
  const client = getFeishuClient();
  const authOptions = lark.withUserAccessToken(accessToken);

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

export async function getFeishuMinuteInfo({
  accessToken,
  minuteToken,
}: GetFeishuMinuteInfoInput): Promise<FeishuMinuteInfo> {
  const res = await getFeishuClient().minutes.v1.minute.get(
    {
      path: {
        minute_token: minuteToken,
      },
      params: {
        user_id_type: "open_id",
      },
    },
    lark.withUserAccessToken(accessToken),
  );

  if (res.code && res.code !== 0) {
    throw new Error(`get feishu minute failed: ${res.msg ?? res.code}`);
  }

  const minute = res.data?.minute;
  if (!minute?.url) {
    throw new Error("get feishu minute failed: url is empty");
  }

  return {
    token: minute.token,
    ownerId: minute.owner_id,
    createTime: minute.create_time,
    title: minute.title,
    cover: minute.cover,
    duration: minute.duration,
    url: minute.url,
    noteId: minute.note_id,
  };
}
