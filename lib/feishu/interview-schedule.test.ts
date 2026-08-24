jest.mock("@/lib/feishu/client", () => ({
  getFeishuClient: jest.fn(),
}));

jest.mock("@larksuiteoapi/node-sdk", () => ({
  withUserAccessToken: jest.fn(() => ({ mockedAuth: true })),
}));

import { getFeishuClient } from "@/lib/feishu/client";
import {
  createFeishuInterviewSchedule,
  isFeishuEventNotFoundError,
  updateFeishuInterviewSchedule,
} from "@/lib/feishu/interview-schedule";

const getFeishuClientMock = getFeishuClient as jest.MockedFunction<typeof getFeishuClient>;

function createMockClient() {
  return {
    calendar: {
      v4: {
        calendarEvent: {
          create: jest.fn().mockResolvedValue({
            code: 0,
            data: {
              event: {
                event_id: "event-1",
                vchat: { meeting_url: "https://meet.example/new" },
              },
            },
          }),
          delete: jest.fn().mockResolvedValue({ code: 0 }),
          get: jest.fn().mockResolvedValue({
            code: 0,
            data: {
              event: {
                event_id: "event-1",
                summary: "原面试",
                description: "原描述",
                location: { name: "旧会议室" },
                start_time: { timestamp: "1787547600", timezone: "Asia/Shanghai" },
                end_time: { timestamp: "1787549400", timezone: "Asia/Shanghai" },
                attendees: [{ type: "resource", room_id: "old-room" }],
                vchat: { meeting_url: "https://meet.example/old" },
              },
            },
          }),
          patch: jest.fn().mockResolvedValue({
            code: 0,
            data: {
              event: {
                event_id: "event-1",
                vchat: { meeting_url: "https://meet.example/new" },
              },
            },
          }),
          reply: jest.fn().mockResolvedValue({ code: 0 }),
        },
        calendarEventAttendee: {
          create: jest.fn().mockResolvedValue({ code: 0, data: { attendees: [] } }),
          batchDelete: jest.fn().mockResolvedValue({ code: 0 }),
        },
        freebusy: {
          list: jest.fn().mockResolvedValue({ code: 0, data: { freebusy_list: [] } }),
        },
      },
    },
    vc: {
      v1: {
        reserve: {
          update: jest.fn().mockResolvedValue({
            code: 0,
            data: { reserve: { url: "https://meet.example/new", meeting_no: "new-no" } },
          }),
        },
      },
    },
  } as unknown as ReturnType<typeof getFeishuClient>;
}

function createCreateInput(overrides: Partial<Parameters<typeof createFeishuInterviewSchedule>[0]> = {}) {
  return {
    accessToken: "token",
    organizerOpenId: "organizer",
    calendarId: "shared-calendar",
    summary: "新面试",
    description: "新描述",
    location: "新会议室",
    startsAt: new Date("2026-08-24T06:00:00.000Z"),
    endsAt: new Date("2026-08-24T06:30:00.000Z"),
    attendeeOpenId: "candidate",
    idempotencyKey: "create-1",
    ...overrides,
  };
}

function createUpdateInput(overrides: Partial<Parameters<typeof updateFeishuInterviewSchedule>[0]> = {}) {
  return {
    accessToken: "token",
    organizerOpenId: "organizer",
    calendarId: "shared-calendar",
    eventId: "event-1",
    reserveId: "reserve-1",
    currentMeetingLink: "https://meet.example/old",
    summary: "新面试",
    description: "新描述",
    location: "新会议室",
    meetingRoomId: "new-room",
    previousMeetingRoomId: "old-room",
    startsAt: new Date("2026-08-24T06:00:00.000Z"),
    endsAt: new Date("2026-08-24T06:30:00.000Z"),
    attendeeOpenId: "candidate",
    ...overrides,
  };
}

describe("Feishu interview schedule errors", () => {
  it("recognizes event-not-found responses returned directly by the SDK", () => {
    expect(isFeishuEventNotFoundError({ code: 193001, msg: "event not found" })).toBe(true);
  });

  it("recognizes event-not-found errors wrapped in an HTTP response", () => {
    expect(
      isFeishuEventNotFoundError({
        response: { data: { code: 193001, msg: "event not found" } },
      }),
    ).toBe(true);
  });

  it("recognizes events manually deleted in Feishu", () => {
    expect(
      isFeishuEventNotFoundError({ code: 193003, msg: "event is deleted" }),
    ).toBe(true);
  });

  it("does not hide unrelated Feishu errors", () => {
    expect(isFeishuEventNotFoundError({ code: 999999, msg: "permission denied" })).toBe(false);
  });
});

describe("Feishu interview schedule room update rollback", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("restores the previous event when booking the new room fails", async () => {
    const client = createMockClient();
    const createAttendee = client.calendar.v4.calendarEventAttendee.create as jest.Mock;
    createAttendee.mockImplementation(async (request: { data?: { attendees?: Array<{ type?: string }> } }) => {
      if (request.data?.attendees?.some((attendee) => attendee.type === "resource")) {
        throw new Error("room unavailable");
      }
      return { code: 0, data: { attendees: [] } };
    });
    getFeishuClientMock.mockReturnValue(client);

    await expect(updateFeishuInterviewSchedule(createUpdateInput())).rejects.toThrow("room unavailable");

    expect(createAttendee).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        data: {
          need_notification: true,
          attendees: [{ type: "user", user_id: "candidate" }],
        },
      }),
      expect.anything(),
    );
    expect(createAttendee).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        data: {
          need_notification: false,
          attendees: [{ type: "user", user_id: "organizer" }],
        },
      }),
      expect.anything(),
    );
    expect(client.calendar.v4.calendarEvent.reply).toHaveBeenCalledWith(
      expect.objectContaining({
        path: { calendar_id: "shared-calendar", event_id: "event-1" },
        data: { rsvp_status: "accept" },
      }),
      expect.anything(),
    );
    expect(client.calendar.v4.calendarEvent.patch).toHaveBeenCalledTimes(2);
    expect(client.calendar.v4.calendarEvent.patch).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ path: { calendar_id: "shared-calendar", event_id: "event-1" } }),
      expect.anything(),
    );
    expect(client.calendar.v4.calendarEvent.patch).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ summary: "原面试", location: { name: "旧会议室" } }),
      }),
      expect.anything(),
    );
    expect(client.vc.v1.reserve.update).toHaveBeenCalledTimes(2);
  });

  it("removes the newly booked room when releasing the old room fails", async () => {
    const client = createMockClient();
    const batchDelete = client.calendar.v4.calendarEventAttendee.batchDelete as jest.Mock;
    batchDelete.mockImplementation(async (request: { data?: { delete_ids?: Array<{ room_id?: string }> } }) => {
      if (request.data?.delete_ids?.[0]?.room_id === "old-room") {
        throw new Error("old room release failed");
      }
      return { code: 0 };
    });
    getFeishuClientMock.mockReturnValue(client);

    await expect(updateFeishuInterviewSchedule(createUpdateInput())).rejects.toThrow(
      "old room release failed",
    );

    expect(batchDelete).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        data: { need_notification: false, delete_ids: [{ type: "resource", room_id: "new-room" }] },
      }),
      expect.anything(),
    );
    expect(client.calendar.v4.calendarEvent.patch).toHaveBeenCalledTimes(2);
    expect(client.vc.v1.reserve.update).toHaveBeenCalledTimes(2);
  });
});

describe("Feishu interview schedule organizer attendance", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("propagates a non-zero organizer attendee response when updating", async () => {
    const client = createMockClient();
    const createAttendee = client.calendar.v4.calendarEventAttendee.create as jest.Mock;
    createAttendee.mockImplementation(async (request: { data?: { attendees?: Array<{ user_id?: string }> } }) => {
      if (request.data?.attendees?.[0]?.user_id === "organizer") {
        return { code: 999, msg: "attendee failed" };
      }
      return { code: 0, data: { attendees: [] } };
    });
    getFeishuClientMock.mockReturnValue(client);

    await expect(updateFeishuInterviewSchedule(createUpdateInput())).rejects.toThrow(
      "add feishu calendar organizer failed: attendee failed",
    );

    expect(client.calendar.v4.calendarEvent.reply).not.toHaveBeenCalled();
    expect(client.calendar.v4.calendarEvent.patch).toHaveBeenCalledTimes(1);
  });

  it("keeps the schedule when shared-calendar RSVP is forbidden", async () => {
    const client = createMockClient();
    const reply = client.calendar.v4.calendarEvent.reply as jest.Mock;
    reply.mockRejectedValue({ response: { status: 403 } });
    getFeishuClientMock.mockReturnValue(client);

    await expect(updateFeishuInterviewSchedule(createUpdateInput())).resolves.toMatchObject({
      eventId: "event-1",
      meetingLink: "https://meet.example/new",
    });

    expect(reply).toHaveBeenCalledTimes(1);
    expect(client.calendar.v4.calendarEvent.patch).toHaveBeenCalledTimes(1);
  });

  it("propagates an unexpected organizer RSVP response when updating", async () => {
    const client = createMockClient();
    const reply = client.calendar.v4.calendarEvent.reply as jest.Mock;
    reply.mockResolvedValue({ code: 999, msg: "RSVP failed" });
    getFeishuClientMock.mockReturnValue(client);

    await expect(updateFeishuInterviewSchedule(createUpdateInput())).rejects.toThrow(
      "accept feishu calendar organizer failed: RSVP failed",
    );

    expect(client.calendar.v4.calendarEvent.patch).toHaveBeenCalledTimes(1);
  });

  it("propagates organizer invitation request failures when updating", async () => {
    const client = createMockClient();
    const createAttendee = client.calendar.v4.calendarEventAttendee.create as jest.Mock;
    createAttendee.mockImplementation(async (request: { data?: { attendees?: Array<{ user_id?: string }> } }) => {
      if (request.data?.attendees?.[0]?.user_id === "organizer") {
        throw new Error("organizer invitation failed");
      }
      return { code: 0, data: { attendees: [] } };
    });
    getFeishuClientMock.mockReturnValue(client);

    await expect(updateFeishuInterviewSchedule(createUpdateInput())).rejects.toThrow(
      "organizer invitation failed",
    );

    expect(client.calendar.v4.calendarEvent.patch).toHaveBeenCalledTimes(1);
  });

  it("deletes a newly created event when organizer setup fails", async () => {
    const client = createMockClient();
    const createAttendee = client.calendar.v4.calendarEventAttendee.create as jest.Mock;
    createAttendee.mockImplementation(async (request: { data?: { attendees?: Array<{ user_id?: string }> } }) => {
      if (request.data?.attendees?.[0]?.user_id === "organizer") {
        return { code: 999, msg: "attendee failed" };
      }
      return { code: 0, data: { attendees: [] } };
    });
    getFeishuClientMock.mockReturnValue(client);

    await expect(createFeishuInterviewSchedule(createCreateInput())).rejects.toThrow(
      "add feishu calendar organizer failed: attendee failed",
    );

    expect(client.calendar.v4.calendarEvent.delete).toHaveBeenCalledWith(
      {
        path: { calendar_id: "shared-calendar", event_id: "event-1" },
        params: { need_notification: "false" },
      },
      expect.anything(),
    );
  });
});
