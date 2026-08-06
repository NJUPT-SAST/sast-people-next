import {
  getMeetingCalendarEventId,
  getMeetingEndedAt,
  getMeetingId,
  getMinuteSourceEntityId,
  getMinuteToken,
} from "./interview-event";

describe("Feishu interview event payloads", () => {
  it("supports both legacy nested and current flat meeting-ended payloads", () => {
    expect(
      getMeetingCalendarEventId({ meeting: { calendar_event_id: "event-legacy" } }),
    ).toBe("event-legacy");
    expect(getMeetingCalendarEventId({ calendar_event_id: "event-current" })).toBe(
      "event-current",
    );
    expect(getMeetingId({ meeting_id: "meeting-current" })).toBe("meeting-current");
  });

  it("normalizes seconds and milliseconds meeting end times", () => {
    expect(getMeetingEndedAt({ end_time: "1710000000" }).toISOString()).toBe(
      "2024-03-09T16:00:00.000Z",
    );
    expect(getMeetingEndedAt({ end_time: "1710000000000" }).toISOString()).toBe(
      "2024-03-09T16:00:00.000Z",
    );
  });

  it("uses the minute source meeting ID for schedule correlation", () => {
    const event = {
      minute: {
        token: "minute-token",
        minute_source: { source_entity_id: "meeting-unique-id" },
      },
    };

    expect(getMinuteToken(event)).toBe("minute-token");
    expect(getMinuteSourceEntityId(event)).toBe("meeting-unique-id");
  });
});
