jest.mock("server-only", () => ({}));

export {};

const mockReturning = jest.fn();
const mockOnConflictDoUpdate = jest.fn(() => ({
  returning: mockReturning,
}));

const mockDb = {
  insert: jest.fn(() => ({
    values: jest.fn(() => ({
      onConflictDoUpdate: mockOnConflictDoUpdate,
    })),
  })),
};

jest.mock("@/db/drizzle", () => ({
  db: mockDb,
}));

const originalRateLimit = process.env.EMAIL_SEND_RATE_LIMIT_PER_MINUTE;

describe("email send rate limit", () => {
  let claimEmailSendRateLimit: typeof import("@/lib/email-center/rate-limit").claimEmailSendRateLimit;

  beforeAll(async () => {
    ({ claimEmailSendRateLimit } = await import("@/lib/email-center/rate-limit"));
  });

  beforeEach(() => {
    process.env.EMAIL_SEND_RATE_LIMIT_PER_MINUTE = "2";
    mockReturning.mockReset();
    mockOnConflictDoUpdate.mockClear();
    mockDb.insert.mockClear();
  });

  afterAll(() => {
    if (originalRateLimit === undefined) {
      delete process.env.EMAIL_SEND_RATE_LIMIT_PER_MINUTE;
    } else {
      process.env.EMAIL_SEND_RATE_LIMIT_PER_MINUTE = originalRateLimit;
    }
  });

  it("claims a shared minute bucket when under the configured limit", async () => {
    mockReturning.mockResolvedValue([{ count: 1 }]);

    await expect(
      claimEmailSendRateLimit({
        now: new Date("2026-06-10T12:34:20.000Z"),
      }),
    ).resolves.toMatchObject({
      allowed: true,
      limit: 2,
      bucketKey: "smtp:2026-06-10T12:34:00.000Z",
      count: 1,
      retryAfterSeconds: 40,
    });
  });

  it("reports blocked claims when the bucket is already full", async () => {
    mockReturning.mockResolvedValue([]);

    await expect(
      claimEmailSendRateLimit({
        now: new Date("2026-06-10T12:34:59.000Z"),
      }),
    ).resolves.toMatchObject({
      allowed: false,
      limit: 2,
      count: null,
      retryAfterSeconds: 1,
    });
  });
});
