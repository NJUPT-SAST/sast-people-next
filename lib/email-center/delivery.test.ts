jest.mock("server-only", () => ({}));

export {};

const mockSendMail = jest.fn();
const mockAssertEmailSendRateLimit = jest.fn();
const mockSelectResults: unknown[][] = [];
const mockUpdateResults: unknown[][] = [];
const mockUpdateSetCalls: unknown[] = [];
const mockInsertValueCalls: unknown[] = [];

type QueryPromise<T> = Promise<T> & {
  limit: jest.Mock;
  returning: jest.Mock;
};

function createQueryPromise<T>(result: T): QueryPromise<T> {
  const promise = Promise.resolve(result) as QueryPromise<T>;
  promise.limit = jest.fn(() => Promise.resolve(result));
  promise.returning = jest.fn(() => Promise.resolve(result));
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
      const result = mockUpdateResults.shift() ?? [];
      return {
        where: jest.fn(() => createQueryPromise(result)),
      };
    }),
  })),
  insert: jest.fn(() => ({
    values: jest.fn((values: unknown) => {
      mockInsertValueCalls.push(values);
      return {
        returning: jest.fn(() => Promise.resolve([{ id: 77 }])),
      };
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

jest.mock("@/lib/email-center/render", () => ({
  renderEmailTemplate: jest.fn(),
}));

jest.mock("@/lib/email-center/rate-limit", () => ({
  assertEmailSendRateLimit: mockAssertEmailSendRateLimit,
}));

jest.mock("nodemailer", () => ({
  createTransport: jest.fn(() => ({
    sendMail: mockSendMail,
  })),
}));

let sendEmailDelivery: typeof import("@/lib/email-center/delivery").sendEmailDelivery;

const pendingDelivery = {
  id: 1,
  idempotencyKey: null,
  category: "result",
  templateKey: "recruitment.result.accepted",
  toAddress: "candidate@njupt.edu.cn",
  subject: "结果通知",
  htmlSnapshot: "<p>邮件正文</p>",
  status: "pending",
  errorMessage: null,
  providerMessageId: null,
  attemptCount: 0,
  lastAttemptAt: null,
  nextRetryAt: null,
  deadLetteredAt: null,
  fkEmailBatchId: null,
  fkFlowId: 7,
  fkUserFlowId: 11,
  fkUserId: 23,
  relatedScheduleId: null,
  createdBy: 5,
  metadata: null,
  createdAt: new Date("2026-06-07T00:00:00.000Z"),
  sentAt: null,
  updatedAt: new Date("2026-06-07T00:00:00.000Z"),
};

const originalEmailPassword = process.env.EMAIL_PASSWORD;
const originalEmailTestRecipient = process.env.EMAIL_TEST_RECIPIENT;
const originalEmailRetryMaxAttempts = process.env.EMAIL_RETRY_MAX_ATTEMPTS;

describe("sendEmailDelivery", () => {
  beforeAll(async () => {
    ({ sendEmailDelivery } = await import("@/lib/email-center/delivery"));
  });

  beforeEach(() => {
    process.env.EMAIL_PASSWORD = "local-test-password";
    delete process.env.EMAIL_TEST_RECIPIENT;
    mockSelectResults.length = 0;
    mockUpdateResults.length = 0;
    mockUpdateSetCalls.length = 0;
    mockInsertValueCalls.length = 0;
    jest.clearAllMocks();
    mockAssertEmailSendRateLimit.mockResolvedValue({
      allowed: true,
      limit: 120,
      bucketKey: "smtp:test",
      count: 1,
      retryAfterSeconds: 60,
    });
    delete process.env.EMAIL_RETRY_MAX_ATTEMPTS;
  });

  afterAll(() => {
    if (originalEmailPassword === undefined) {
      delete process.env.EMAIL_PASSWORD;
    } else {
      process.env.EMAIL_PASSWORD = originalEmailPassword;
    }
    if (originalEmailTestRecipient === undefined) {
      delete process.env.EMAIL_TEST_RECIPIENT;
    } else {
      process.env.EMAIL_TEST_RECIPIENT = originalEmailTestRecipient;
    }
    if (originalEmailRetryMaxAttempts === undefined) {
      delete process.env.EMAIL_RETRY_MAX_ATTEMPTS;
    } else {
      process.env.EMAIL_RETRY_MAX_ATTEMPTS = originalEmailRetryMaxAttempts;
    }
  });

  it("claims a pending delivery before sending and records provider result", async () => {
    mockSelectResults.push([pendingDelivery]);
    mockUpdateResults.push([{ id: pendingDelivery.id }], []);
    mockSendMail.mockResolvedValue({ messageId: "smtp-message-1" });

    await expect(sendEmailDelivery(pendingDelivery.id)).resolves.toEqual({
      messageId: "smtp-message-1",
    });

    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "b24150524@njupt.edu.cn",
        subject: "[TEST to candidate@njupt.edu.cn] 结果通知",
        html: "<p>邮件正文</p>",
      }),
    );
    expect(mockUpdateSetCalls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          status: "sending",
          errorMessage: null,
          providerMessageId: null,
          sentAt: null,
          attemptCount: expect.anything(),
          lastAttemptAt: expect.any(Date),
        }),
        expect.objectContaining({
          status: "sent",
          providerMessageId: "smtp-message-1",
          errorMessage: null,
          nextRetryAt: null,
          deadLetteredAt: null,
        }),
        expect.objectContaining({
          status: "sent",
          providerMessageId: "smtp-message-1",
          errorMessage: null,
          finishedAt: expect.any(Date),
          durationMs: expect.any(Number),
        }),
      ]),
    );
    expect(mockInsertValueCalls).toEqual([
      expect.objectContaining({
        fkEmailDeliveryId: pendingDelivery.id,
        trigger: "unknown",
        provider: "smtp",
        status: "sending",
        triggeredBy: null,
        startedAt: expect.any(Date),
      }),
    ]);
    expect(mockAssertEmailSendRateLimit).toHaveBeenCalledTimes(1);
  });

  it("does not send again when another worker already sent the delivery", async () => {
    mockSelectResults.push(
      [pendingDelivery],
      [{ status: "sent", providerMessageId: "smtp-existing" }],
    );
    mockUpdateResults.push([]);

    await expect(sendEmailDelivery(pendingDelivery.id)).resolves.toEqual({
      messageId: "smtp-existing",
    });

    expect(mockSendMail).not.toHaveBeenCalled();
  });

  it("rejects an already sending delivery instead of sending concurrently", async () => {
    mockSelectResults.push([
      {
        ...pendingDelivery,
        status: "sending",
      },
    ]);

    await expect(sendEmailDelivery(pendingDelivery.id)).rejects.toThrow(
      "邮件正在发送中",
    );

    expect(mockDb.update).not.toHaveBeenCalled();
    expect(mockSendMail).not.toHaveBeenCalled();
  });

  it("marks the delivery failed when smtp sending fails", async () => {
    mockSelectResults.push([pendingDelivery]);
    mockUpdateResults.push([{ id: pendingDelivery.id }], []);
    mockSendMail.mockRejectedValue(new Error("SMTP down"));

    await expect(sendEmailDelivery(pendingDelivery.id)).rejects.toThrow(
      "SMTP down",
    );

    expect(mockUpdateSetCalls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          status: "failed",
          errorMessage: "SMTP down",
          nextRetryAt: expect.any(Date),
          deadLetteredAt: null,
        }),
      ]),
    );
    expect(mockInsertValueCalls).toEqual([
      expect.objectContaining({
        fkEmailDeliveryId: pendingDelivery.id,
        status: "sending",
      }),
    ]);
  });

  it("dead-letters the delivery after the retry limit is reached", async () => {
    process.env.EMAIL_RETRY_MAX_ATTEMPTS = "1";
    mockSelectResults.push([pendingDelivery]);
    mockUpdateResults.push([{ id: pendingDelivery.id }], []);
    mockSendMail.mockRejectedValue(new Error("SMTP down"));

    await expect(sendEmailDelivery(pendingDelivery.id)).rejects.toThrow(
      "SMTP down",
    );

    expect(mockUpdateSetCalls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          status: "dead",
          errorMessage: "SMTP down",
          nextRetryAt: null,
          deadLetteredAt: expect.any(Date),
        }),
      ]),
    );
  });
});
