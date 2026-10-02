import type { createOfficeRoundOneEmailBatch as CreateOfficeRoundOneEmailBatch } from "@/lib/email-center/batch";

jest.mock("server-only", () => ({}));

export {};

const mockSelectResults: unknown[][] = [];
const mockUpdateSetCalls: unknown[] = [];
const mockInsertValues: unknown[] = [];
const mockOffer = jest.fn();
const mockListPeopleUsersByLinkIds = jest.fn();
const mockGetEmailTemplateSetting = jest.fn();
const mockRenderEmailTemplate = jest.fn();
const mockAssertEmailConfigured = jest.fn();

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
    then: (resolve: (value: unknown) => unknown) => resolve(result),
  }));
  return promise;
}

const mockDb = {
  select: jest.fn(() => {
    const result = mockSelectResults.shift() ?? [];
    return {
      from: jest.fn(() => ({
        where: jest.fn(() => createQueryPromise(result)),
        innerJoin: jest.fn(() => ({
          where: jest.fn(() => createQueryPromise(result)),
        })),
        leftJoin: jest.fn(() => ({
          where: jest.fn(() => createQueryPromise(result)),
        })),
      })),
    };
  }),
  insert: jest.fn(() => ({
    values: jest.fn((values: unknown) => {
      mockInsertValues.push(values);
      return {
        onConflictDoNothing: jest.fn(() => ({
          returning: jest.fn(() => Promise.resolve([{ id: 1 }])),
          then: (resolve: (value: unknown) => unknown) => resolve([{ id: 1 }]),
        })),
        returning: jest.fn(() => Promise.resolve([{ id: 1 }])),
      };
    }),
  })),
  update: jest.fn(() => ({
    set: jest.fn((values: unknown) => {
      mockUpdateSetCalls.push(values);
      return { where: jest.fn(() => Promise.resolve([])) };
    }),
  })),
};

const mockTransaction = jest.fn((callback: (tx: typeof mockDb) => Promise<unknown>) =>
  callback(mockDb),
);

jest.mock("@/db/drizzle", () => ({
  db: { ...mockDb, transaction: mockTransaction },
}));

jest.mock("@/lib/email-center/template-resolution", () => ({
  readResultEmailTemplateSetting: mockGetEmailTemplateSetting,
}));

jest.mock("@/event", () => ({ __esModule: true, default: { offer: mockOffer } }));

jest.mock("@/lib/email-center/delivery", () => ({ sendEmailDelivery: jest.fn() }));

jest.mock("@/lib/email-center/render", () => ({
  renderEmailTemplate: mockRenderEmailTemplate,
}));

jest.mock("@/lib/email-center/provider", () => ({
  assertEmailConfigured: mockAssertEmailConfigured,
}));

jest.mock("@/lib/link/user-lookup", () => ({
  listPeopleUsersByLinkIds: mockListPeopleUsersByLinkIds,
}));

let createOfficeRoundOneEmailBatch: typeof CreateOfficeRoundOneEmailBatch;

describe("office round one email batch", () => {
  beforeAll(async () => {
    /* 动态导入：须等 jest.mock 注册完成后再加载被测模块（与 batch.test.ts 同约定） */
    ({ createOfficeRoundOneEmailBatch } = await import("@/lib/email-center/batch"));
  });

  beforeEach(() => {
    mockSelectResults.length = 0;
    mockUpdateSetCalls.length = 0;
    mockInsertValues.length = 0;
    jest.clearAllMocks();
    mockAssertEmailConfigured.mockReturnValue(undefined);
    mockListPeopleUsersByLinkIds.mockResolvedValue(
      new Map([
        [307, { id: 307, name: "Grace", studentId: "B007" }],
        [308, { id: 308, name: "Heidi", studentId: "B008" }],
      ]),
    );
    mockGetEmailTemplateSetting.mockImplementation(async (key: string, department: string) => ({
      templateKey: key,
      subjectTemplate: "{name}{department}一轮面试结果通知",
      groupNumber: department === "office" ? "111" : "222",
    }));
    mockRenderEmailTemplate.mockImplementation(async ({ variables }: { variables: { name: string } }) => ({
      subject: `${variables.name}通知`,
      html: "<p>通知正文</p>",
    }));
  });

  it("returns null when nobody advanced to round two", async () => {
    mockSelectResults.push(
      [{ id: 11, title: "2026 办公类部门面试招新", department: "office" }],
      [],
    );

    await expect(
      createOfficeRoundOneEmailBatch({ flowId: 11, createdBy: 99, accept: true }),
    ).resolves.toBeNull();
    expect(mockDb.insert).not.toHaveBeenCalled();
  });

  it("resolves the flow department template for all recipients without touching candidate status", async () => {
    mockSelectResults.push(
      [{ id: 11, title: "2026 办公类部门面试招新", department: "office" }],
      [
        { userFlowId: 207, userId: 307 },
        { userFlowId: 208, userId: 308 },
      ],
      [],
      // sendEmailBatchById: batch row
      [{ id: 1, category: "result", accept: true, status: "draft" }],
      // sendEmailBatchById: stale sending deliveries
      [],
      // sendEmailBatchById: deliveries of the batch
      [
        { id: 41, userFlowId: 207, userId: 307, status: "pending" },
        { id: 42, userFlowId: 208, userId: 308, status: "pending" },
      ],
    );

    await expect(
      createOfficeRoundOneEmailBatch({ flowId: 11, createdBy: 99, accept: true }),
    ).resolves.toEqual({ batchId: 1, recipientCount: 2 });

    const batchInsert = mockInsertValues[0] as Record<string, unknown>;
    expect(batchInsert.templateKey).toBe("office_round1.result.accepted");
    expect(batchInsert.accept).toBe(true);
    expect(batchInsert.name).toBe("2026 办公类部门面试招新 一面通过通知");
    expect(batchInsert.metadata).toEqual({
      accept: true,
      flowId: 11,
      round: 1,
      scope: "office_round1",
    });

    const deliveryInsert = mockInsertValues[1] as Record<string, unknown>;
    expect(deliveryInsert.idempotencyKey).toContain("office_round1:accepted:207");
    expect(deliveryInsert.templateKey).toBe("office_round1.result.accepted");

    /* 模板按本流程归属部门解析：同一流程内的候选人都用「办公室」的部门覆盖 */
    expect(mockGetEmailTemplateSetting).toHaveBeenCalledWith(
      "office_round1.result.accepted",
      "office",
    );
    expect(mockRenderEmailTemplate).toHaveBeenCalledWith(
      expect.objectContaining({
        templateKey: "office_round1.result.accepted",
        department: "office",
        variables: expect.objectContaining({
          flowKind: "office_round1",
          round: 1,
          department: "办公室",
          groupNumber: "111",
        }),
      }),
    );
    expect(mockRenderEmailTemplate).toHaveBeenCalledTimes(2);
    for (const [request] of mockRenderEmailTemplate.mock.calls) {
      expect(request).toEqual(
        expect.objectContaining({
          templateKey: "office_round1.result.accepted",
          department: "office",
          variables: expect.objectContaining({
            department: "办公室",
            groupNumber: "111",
          }),
        }),
      );
    }

    expect(mockOffer).toHaveBeenCalledWith(41);
    expect(mockOffer).toHaveBeenCalledWith(42);
    /* 一面通知绝不推进报名状态 */
    expect(mockUpdateSetCalls).not.toContainEqual(
      expect.objectContaining({ progressStatus: expect.anything() }),
    );
  });

  it("uses the rejecting flow's own department template for round-one rejections", async () => {
    mockSelectResults.push(
      [{ id: 12, title: "2026 科宣部面试招新", department: "publicity" }],
      [{ userFlowId: 209, userId: 308 }],
      [],
      // sendEmailBatchById: batch row
      [{ id: 1, category: "result", accept: false, status: "draft" }],
      // sendEmailBatchById: stale sending deliveries
      [],
      // sendEmailBatchById: deliveries of the batch
      [{ id: 43, userFlowId: 209, userId: 308, status: "pending" }],
    );

    await expect(
      createOfficeRoundOneEmailBatch({ flowId: 12, createdBy: 99, accept: false }),
    ).resolves.toEqual({ batchId: 1, recipientCount: 1 });

    const batchInsert = mockInsertValues[0] as Record<string, unknown>;
    expect(batchInsert.templateKey).toBe("office_round1.result.rejected");
    expect(batchInsert.name).toBe("2026 科宣部面试招新 一面不通过通知");
    expect(batchInsert.metadata).toEqual({
      accept: false,
      flowId: 12,
      round: 1,
      scope: "office_round1_rejected",
    });

    expect(mockGetEmailTemplateSetting).toHaveBeenCalledWith(
      "office_round1.result.rejected",
      "publicity",
    );
    expect(mockRenderEmailTemplate).toHaveBeenCalledWith(
      expect.objectContaining({
        templateKey: "office_round1.result.rejected",
        department: "publicity",
        variables: expect.objectContaining({
          flowKind: "office_round1",
          round: 1,
          department: "科宣部",
          groupNumber: "222",
        }),
      }),
    );
  });

  it("skips recipients already sent and resends pending deliveries only", async () => {
    mockSelectResults.push(
      [{ id: 11, title: "2026 办公类部门面试招新", department: "office" }],
      [
        { userFlowId: 207, userId: 307 },
        { userFlowId: 208, userId: 308 },
      ],
      [
        { batchId: 5, userFlowId: 207, status: "sent" },
        { batchId: 6, userFlowId: 208, status: "failed" },
      ],
      // sendEmailBatchById(6, ...) : batch row
      [{ id: 6, category: "result", accept: true, status: "failed" }],
      [],
      [{ id: 42, userFlowId: 208, userId: 308, status: "failed" }],
    );

    await expect(
      createOfficeRoundOneEmailBatch({ flowId: 11, createdBy: 99, accept: true }),
    ).resolves.toEqual({ batchId: 6, recipientCount: 1 });

    /* 没有新候选人 → 不新建批次 */
    expect(mockDb.insert).not.toHaveBeenCalled();
    expect(mockOffer).toHaveBeenCalledWith(42);
    expect(mockUpdateSetCalls).not.toContainEqual(
      expect.objectContaining({ progressStatus: expect.anything() }),
    );
  });

  it("returns null when every recipient already received the notice", async () => {
    mockSelectResults.push(
      [{ id: 11, title: "2026 办公类部门面试招新", department: "office" }],
      [{ userFlowId: 207, userId: 307 }],
      [{ batchId: 5, userFlowId: 207, status: "sent" }],
    );

    await expect(
      createOfficeRoundOneEmailBatch({ flowId: 11, createdBy: 99, accept: true }),
    ).resolves.toBeNull();
    expect(mockOffer).not.toHaveBeenCalled();
  });
});
