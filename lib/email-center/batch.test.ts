jest.mock("server-only", () => ({}));

const mockSelectResults: unknown[][] = [];
const mockUpdateSetCalls: unknown[] = [];
const mockOffer = jest.fn();
const mockSyncUserRoleFromAcceptedFlows = jest.fn();

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
  sendEmailDelivery: jest.fn(),
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
});
