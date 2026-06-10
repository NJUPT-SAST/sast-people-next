jest.mock("server-only", () => ({}));

export {};

const mockSelectResults: unknown[][] = [];
const mockUpdateSetCalls: unknown[] = [];
const mockOffer = jest.fn();
const mockSyncUserRoleFromAcceptedFlows = jest.fn();
const mockAssertEmailConfigured = jest.fn();
const mockSendEmailDelivery = jest.fn();
const mockListPeopleUsersByLinkIds = jest.fn();
const mockGetEmailTemplateSetting = jest.fn();
const mockRenderEmailTemplate = jest.fn();

type QueryPromise<T> = Promise<T> & {
  limit: jest.Mock;
  returning: jest.Mock;
  orderBy: jest.Mock;
  onConflictDoNothing: jest.Mock;
};

function createQueryPromise<T>(result: T): QueryPromise<T> {
  const promise = Promise.resolve(result) as QueryPromise<T>;
  promise.limit = jest.fn(() => Promise.resolve(result));
  promise.returning = jest.fn(() => Promise.resolve(result));
  promise.orderBy = jest.fn(() => Promise.resolve(result));
  promise.onConflictDoNothing = jest.fn(() => ({
    returning: jest.fn(() => Promise.resolve(result)),
  }));
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
  insert: jest.fn(() => ({
    values: jest.fn(() => ({
      onConflictDoNothing: jest.fn(() => ({
        returning: jest.fn(() => Promise.resolve([{ id: 1 }])),
      })),
      returning: jest.fn(() => Promise.resolve([{ id: 1 }])),
    })),
  })),
  update: jest.fn(() => ({
    set: jest.fn((values: unknown) => {
      mockUpdateSetCalls.push(values);
      return {
        where: jest.fn(() => Promise.resolve([])),
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

jest.mock("@/action/email/template", () => ({
  getEmailTemplateSetting: mockGetEmailTemplateSetting,
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
  sendEmailDelivery: mockSendEmailDelivery,
}));

jest.mock("@/lib/email-center/render", () => ({
  renderEmailTemplate: mockRenderEmailTemplate,
}));

jest.mock("@/lib/email-center/provider", () => ({
  assertEmailConfigured: mockAssertEmailConfigured,
}));

jest.mock("@/lib/link/user-lookup", () => ({
  listPeopleUsersByLinkIds: mockListPeopleUsersByLinkIds,
}));

let sendEmailBatchById: typeof import("@/lib/email-center/batch").sendEmailBatchById;
let createResultEmailBatch: typeof import("@/lib/email-center/batch").createResultEmailBatch;

describe("email batch service", () => {
  beforeAll(async () => {
    ({ createResultEmailBatch, sendEmailBatchById } = await import("@/lib/email-center/batch"));
  });

  beforeEach(() => {
    mockSelectResults.length = 0;
    mockUpdateSetCalls.length = 0;
    jest.clearAllMocks();
    mockAssertEmailConfigured.mockReturnValue(undefined);
    mockListPeopleUsersByLinkIds.mockResolvedValue(new Map());
    mockGetEmailTemplateSetting.mockResolvedValue({
      templateKey: "recruitment.result.accepted",
      subjectTemplate: "{flowName} 结果通知",
    });
    mockRenderEmailTemplate.mockResolvedValue({
      subject: "2026 春季招新 结果通知",
      html: "<p>通知正文</p>",
    });
  });

  it("rejects result batch creation before inserting when recipients miss student ids", async () => {
    mockSelectResults.push([
      {
        userFlowId: 201,
        userId: 301,
        flowName: "2026 春季招新",
      },
      {
        userFlowId: 202,
        userId: 302,
        flowName: "2026 春季招新",
      },
    ], []);
    mockListPeopleUsersByLinkIds.mockResolvedValue(
      new Map([
        [301, { id: 301, name: "Alice", studentId: "B001" }],
        [302, { id: 302, name: "Bob", studentId: null }],
      ]),
    );

    await expect(
      createResultEmailBatch({
        userIds: [301, 302],
        flowId: 7,
        accept: true,
        createdBy: 99,
      }),
    ).rejects.toThrow("Bob");

    expect(mockDb.insert).not.toHaveBeenCalled();
    expect(mockTransaction).not.toHaveBeenCalled();
    expect(mockRenderEmailTemplate).not.toHaveBeenCalled();
  });

  it("creates result batches and deliveries in one transaction", async () => {
    mockSelectResults.push([
      {
        userFlowId: 203,
        userId: 303,
        flowName: "2026 春季招新",
      },
    ], []);
    mockListPeopleUsersByLinkIds.mockResolvedValue(
      new Map([[303, { id: 303, name: "Carol", studentId: "B003" }]]),
    );

    await expect(
      createResultEmailBatch({
        userIds: [303],
        flowId: 7,
        accept: true,
        createdBy: 99,
      }),
    ).resolves.toEqual({ batchId: 1, deliveryCount: 1 });

    expect(mockRenderEmailTemplate).toHaveBeenCalledWith({
      templateKey: "recruitment.result.accepted",
      variables: {
        name: "Carol",
        flowName: "2026 春季招新",
        setting: {
          templateKey: "recruitment.result.accepted",
          subjectTemplate: "{flowName} 结果通知",
        },
      },
    });
    expect(mockTransaction).toHaveBeenCalledTimes(1);
    expect(mockDb.insert).toHaveBeenCalledTimes(2);
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

    expect(mockSendEmailDelivery).toHaveBeenCalledWith(103, {
      trigger: "batch_fallback",
    });
    expect(mockUpdateSetCalls).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          errorMessage: "邮件发送服务未启动或未配置，请检查 Inngest 邮件队列和 EMAIL_PASSWORD。",
        }),
      ]),
    );
  });
});
