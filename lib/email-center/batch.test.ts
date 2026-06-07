jest.mock("server-only", () => ({}));

const mockSelectResults: unknown[][] = [];
const mockUpdateSetCalls: unknown[] = [];
const mockOffer = jest.fn();
const mockSyncUserRoleFromAcceptedFlows = jest.fn();
const mockAssertEmailConfigured = jest.fn();
const mockSendEmailDelivery = jest.fn();

type QueryPromise<T> = Promise<T> & {
  limit: jest.Mock;
  returning: jest.Mock;
  orderBy: jest.Mock;
};

function createQueryPromise<T>(result: T): QueryPromise<T> {
  const promise = Promise.resolve(result) as QueryPromise<T>;
  promise.limit = jest.fn(() => Promise.resolve(result));
  promise.returning = jest.fn(() => Promise.resolve(result));
  promise.orderBy = jest.fn(() => Promise.resolve(result));
  return promise;
}

const mockDb = {
  select: jest.fn(() => {
    const result = mockSelectResults.shift() ?? [];
    return {
      from: jest.fn(() => ({
        innerJoin: jest.fn(() => ({
          where: jest.fn(() => createQueryPromise(result)),
        })),
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
};

jest.mock("@/db/drizzle", () => ({
  db: mockDb,
}));

jest.mock("@/action/email/template", () => ({
  getEmailTemplateSetting: jest.fn(),
}));

jest.mock("@/action/user-flow/roleTransition", () => ({
  syncUserRoleFromAcceptedFlows: mockSyncUserRoleFromAcceptedFlows,
}));

jest.mock("@/event", () => ({
  __esModule: true,
  default: {
    offer: mockOffer,
  },
}));

jest.mock("@/lib/email-center/delivery", () => ({
  createRenderedEmailDelivery: jest.fn(),
  sendEmailDelivery: mockSendEmailDelivery,
}));

jest.mock("@/lib/email-center/provider", () => ({
  assertEmailConfigured: mockAssertEmailConfigured,
}));

jest.mock("@/lib/link/user-lookup", () => ({
  listPeopleUsersByLinkIds: jest.fn(),
}));

let sendEmailBatchById: typeof import("@/lib/email-center/batch").sendEmailBatchById;

describe("sendEmailBatchById", () => {
  beforeAll(async () => {
    ({ sendEmailBatchById } = await import("@/lib/email-center/batch"));
  });

  beforeEach(() => {
    mockSelectResults.length = 0;
    mockUpdateSetCalls.length = 0;
    jest.clearAllMocks();
    mockAssertEmailConfigured.mockReturnValue(undefined);
  });

  it("recovers stale sending deliveries before queueing a batch", async () => {
    mockSelectResults.push(
      [
        {
          id: 7,
          category: "result",
          accept: true,
          status: "queued",
        },
      ],
      [{ id: 101 }],
      [
        {
          id: 101,
          userFlowId: 201,
          userId: 301,
          status: "failed",
        },
      ],
    );
    mockOffer.mockResolvedValue(undefined);
    mockSyncUserRoleFromAcceptedFlows.mockResolvedValue(undefined);

    await expect(sendEmailBatchById(7)).resolves.toEqual({ queuedCount: 1 });

    expect(mockOffer).toHaveBeenCalledWith(101);
    expect(mockSyncUserRoleFromAcceptedFlows).toHaveBeenCalledWith(301);
    expect(mockUpdateSetCalls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          status: "failed",
          errorMessage: "发送任务可能已中断，请确认后重试。",
        }),
        expect.objectContaining({
          status: "pending",
          errorMessage: null,
        }),
        expect.objectContaining({
          status: "queued",
        }),
      ]),
    );
  });

  it("marks deliveries failed when queueing fails and provider is not configured", async () => {
    mockSelectResults.push(
      [
        {
          id: 8,
          category: "result",
          accept: false,
          status: "queued",
        },
      ],
      [],
      [
        {
          id: 102,
          userFlowId: 202,
          userId: 302,
          status: "pending",
        },
      ],
    );
    mockOffer.mockRejectedValue(new Error("queue unavailable"));
    mockAssertEmailConfigured.mockImplementation(() => {
      throw new Error("邮件密码未配置，请先设置 EMAIL_PASSWORD。");
    });
    mockSyncUserRoleFromAcceptedFlows.mockResolvedValue(undefined);

    await expect(sendEmailBatchById(8)).rejects.toThrow(
      "邮件发送服务未启动或未配置",
    );

    expect(mockSendEmailDelivery).not.toHaveBeenCalled();
    expect(mockUpdateSetCalls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          status: "failed",
          errorMessage: "邮件发送服务未启动或未配置，请检查 Inngest 邮件队列和 EMAIL_PASSWORD。",
        }),
        expect.objectContaining({
          status: "failed",
        }),
      ]),
    );
  });

  it("falls back to direct sending when queueing fails but provider is configured", async () => {
    mockSelectResults.push(
      [
        {
          id: 9,
          category: "result",
          accept: true,
          status: "queued",
        },
      ],
      [],
      [
        {
          id: 103,
          userFlowId: 203,
          userId: 303,
          status: "pending",
        },
      ],
    );
    mockOffer.mockRejectedValue(new Error("queue unavailable"));
    mockAssertEmailConfigured.mockReturnValue(undefined);
    mockSendEmailDelivery.mockResolvedValue({ messageId: "direct-message" });
    mockSyncUserRoleFromAcceptedFlows.mockResolvedValue(undefined);

    await expect(sendEmailBatchById(9)).resolves.toEqual({ queuedCount: 1 });

    expect(mockSendEmailDelivery).toHaveBeenCalledWith(103);
    expect(mockUpdateSetCalls).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          errorMessage: "邮件发送服务未启动或未配置，请检查 Inngest 邮件队列和 EMAIL_PASSWORD。",
        }),
      ]),
    );
  });
});
