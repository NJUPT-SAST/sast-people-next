jest.mock("server-only", () => ({}));

export {};

const mockSendEmailDelivery = jest.fn();
const mockSelectResult: unknown[] = [];

type QueryPromise<T> = Promise<T> & {
  orderBy: jest.Mock;
  limit: jest.Mock;
};

function createQueryPromise<T>(result: T): QueryPromise<T> {
  const promise = Promise.resolve(result) as QueryPromise<T>;
  promise.orderBy = jest.fn(() => promise);
  promise.limit = jest.fn(() => Promise.resolve(result));
  return promise;
}

const mockDb = {
  select: jest.fn(() => ({
    from: jest.fn(() => ({
      where: jest.fn(() => createQueryPromise(mockSelectResult)),
    })),
  })),
};

jest.mock("@/db/drizzle", () => ({
  db: mockDb,
}));

jest.mock("@/lib/email-center/delivery", () => ({
  sendEmailDelivery: mockSendEmailDelivery,
}));

jest.mock("@/lib/server-error-log", () => ({
  logServerError: jest.fn(),
}));

describe("retryDueEmailDeliveries", () => {
  let retryDueEmailDeliveries: typeof import("@/lib/email-center/retry").retryDueEmailDeliveries;

  beforeAll(async () => {
    ({ retryDueEmailDeliveries } = await import("@/lib/email-center/retry"));
  });

  beforeEach(() => {
    mockSelectResult.length = 0;
    mockSendEmailDelivery.mockReset();
    mockDb.select.mockClear();
  });

  it("sends due failed deliveries with the automatic retry trigger", async () => {
    mockSelectResult.push({ id: 10 }, { id: 11 });
    mockSendEmailDelivery.mockResolvedValue({ messageId: "ok" });

    await expect(retryDueEmailDeliveries({ limit: 2 })).resolves.toEqual({
      scannedCount: 2,
      retriedCount: 2,
      failedCount: 0,
    });
    expect(mockSendEmailDelivery).toHaveBeenNthCalledWith(1, 10, {
      trigger: "auto_retry",
    });
    expect(mockSendEmailDelivery).toHaveBeenNthCalledWith(2, 11, {
      trigger: "auto_retry",
    });
  });
});
