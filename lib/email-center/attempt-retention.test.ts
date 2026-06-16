jest.mock("server-only", () => ({}));

export {};

const mockReturning = jest.fn();
const mockWhere = jest.fn(() => ({
  returning: mockReturning,
}));

const mockDb = {
  delete: jest.fn(() => ({
    where: mockWhere,
  })),
};

jest.mock("@/db/drizzle", () => ({
  db: mockDb,
}));

describe("deleteOldEmailDeliveryAttempts", () => {
  let deleteOldEmailDeliveryAttempts: typeof import("@/lib/email-center/attempt-retention").deleteOldEmailDeliveryAttempts;

  beforeAll(async () => {
    ({ deleteOldEmailDeliveryAttempts } = await import(
      "@/lib/email-center/attempt-retention"
    ));
  });

  beforeEach(() => {
    mockReturning.mockReset();
    mockWhere.mockClear();
    mockDb.delete.mockClear();
  });

  it("deletes attempts older than the retention cutoff", async () => {
    mockReturning.mockResolvedValue([{ id: 1 }, { id: 2 }]);

    await expect(
      deleteOldEmailDeliveryAttempts({
        now: new Date("2026-06-10T00:00:00.000Z"),
        retentionDays: 30,
      }),
    ).resolves.toEqual({
      deletedCount: 2,
      cutoff: new Date("2026-05-11T00:00:00.000Z"),
      retentionDays: 30,
    });
  });
});
