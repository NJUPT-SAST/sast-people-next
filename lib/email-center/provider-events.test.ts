jest.mock("server-only", () => ({}));

export {};

const mockRefreshEmailBatchStatus = jest.fn();
const mockSelectResults: unknown[][] = [];
const mockUpdateSetCalls: unknown[] = [];
const mockInsertValueCalls: unknown[] = [];

type QueryPromise<T> = Promise<T> & {
  limit: jest.Mock;
};

function createQueryPromise<T>(result: T): QueryPromise<T> {
  const promise = Promise.resolve(result) as QueryPromise<T>;
  promise.limit = jest.fn(() => Promise.resolve(result));
  return promise;
}

const mockDb = {
  select: jest.fn(() => {
    const result = mockSelectResults.shift() ?? [];
    return {
      from: jest.fn(() => ({
        where: jest.fn(() => createQueryPromise(result)),
      })),
    };
  }),
  update: jest.fn(() => ({
    set: jest.fn((values: unknown) => {
      mockUpdateSetCalls.push(values);
      return {
        where: jest.fn(() => Promise.resolve([])),
      };
    }),
  })),
  insert: jest.fn(() => ({
    values: jest.fn((values: unknown) => {
      mockInsertValueCalls.push(values);
      return Promise.resolve([]);
    }),
  })),
};

const mockTransaction = jest.fn((callback: (tx: typeof mockDb) => Promise<unknown>) =>
  callback(mockDb),
);

jest.mock("@/db/drizzle", () => ({
  db: {
    ...mockDb,
    transaction: mockTransaction,
  },
}));

jest.mock("@/lib/email-center/delivery", () => ({
  refreshEmailBatchStatus: mockRefreshEmailBatchStatus,
}));

describe("email provider events", () => {
  let providerEvents: typeof import("@/lib/email-center/provider-events");

  beforeAll(async () => {
    providerEvents = await import("@/lib/email-center/provider-events");
  });

  beforeEach(() => {
    mockSelectResults.length = 0;
    mockUpdateSetCalls.length = 0;
    mockInsertValueCalls.length = 0;
    jest.clearAllMocks();
  });

  it("normalizes provider event payloads", () => {
    expect(
      providerEvents.parseEmailProviderEventPayload({
        provider: "ses",
        type: "delivered",
        delivery_id: "42",
        provider_message_id: "message-42",
        timestamp: "2026-06-10T10:00:00.000Z",
      }),
    ).toEqual({
      provider: "ses",
      event: "delivered",
      deliveryId: 42,
      messageId: "message-42",
      errorMessage: null,
      occurredAt: new Date("2026-06-10T10:00:00.000Z"),
    });
  });

  it("uses constant-time secret comparison", () => {
    expect(
      providerEvents.verifyEmailWebhookSecret({
        expectedSecret: "secret",
        providedSecret: "secret",
      }),
    ).toBe(true);
    expect(
      providerEvents.verifyEmailWebhookSecret({
        expectedSecret: "secret",
        providedSecret: "wrong",
      }),
    ).toBe(false);
  });

  it("dead-letters bounced deliveries and records the provider event", async () => {
    mockSelectResults.push([
      {
        id: 7,
        batchId: 3,
        providerMessageId: "smtp-message",
        attemptCount: 1,
      },
    ]);

    await expect(
      providerEvents.applyEmailProviderEvent({
        provider: "smtp",
        event: "bounced",
        deliveryId: 7,
        messageId: "smtp-message",
        errorMessage: "Mailbox unavailable",
        occurredAt: new Date("2026-06-10T10:00:00.000Z"),
      }),
    ).resolves.toEqual({
      matched: true,
      deliveryId: 7,
      status: "dead",
    });

    expect(mockUpdateSetCalls).toEqual([
      expect.objectContaining({
        status: "dead",
        errorMessage: "Mailbox unavailable",
        deadLetteredAt: new Date("2026-06-10T10:00:00.000Z"),
      }),
    ]);
    expect(mockInsertValueCalls).toEqual([
      expect.objectContaining({
        fkEmailDeliveryId: 7,
        trigger: "provider_event",
        status: "bounced",
        providerMessageId: "smtp-message",
      }),
    ]);
    expect(mockRefreshEmailBatchStatus).toHaveBeenCalledWith(3);
  });
});
