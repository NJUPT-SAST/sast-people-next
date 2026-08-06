export type FeishuMeetingEndedEvent = {
  event_id?: string;
  event_type?: string;
  calendar_event_id?: string;
  meeting_id?: string;
  end_time?: string;
  meeting?: {
    calendar_event_id?: string;
    meeting_id?: string;
    end_time?: string;
  };
};

export type FeishuMinuteGeneratedEvent = {
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

export function getMeetingCalendarEventId(event: FeishuMeetingEndedEvent) {
  return event.calendar_event_id ?? event.meeting?.calendar_event_id ?? null;
}

export function getMeetingId(event: FeishuMeetingEndedEvent) {
  return event.meeting_id ?? event.meeting?.meeting_id ?? null;
}

export function getMeetingEndedAt(event: FeishuMeetingEndedEvent) {
  const value = event.end_time ?? event.meeting?.end_time;
  if (!value) return new Date();

  const numericValue = Number(value);
  if (Number.isFinite(numericValue)) {
    return new Date(numericValue < 1e12 ? numericValue * 1000 : numericValue);
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

export function getMinuteToken(event: FeishuMinuteGeneratedEvent) {
  return event.minute_token ?? event.minute?.minute_token ?? event.minute?.token ?? null;
}

export function getMinuteTitle(event: FeishuMinuteGeneratedEvent) {
  return event.title ?? event.minute?.title ?? null;
}

export function getMinuteUrl(event: FeishuMinuteGeneratedEvent) {
  return event.url ?? event.minute?.url ?? null;
}

export function getMinuteSourceEntityId(event: FeishuMinuteGeneratedEvent) {
  return (
    event.minute_source?.source_entity_id ??
    event.minute?.minute_source?.source_entity_id ??
    event.minute?.source_entity_id ??
    null
  );
}
