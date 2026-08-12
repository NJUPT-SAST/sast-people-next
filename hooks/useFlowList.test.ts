jest.mock("@/db/drizzle", () => ({ db: { select: jest.fn() } }));
jest.mock("@/lib/link/user-lookup", () => ({
  listPeopleUsersByLinkIds: jest.fn(),
}));
jest.mock("@/lib/link/session", () => ({
  MissingLinkAdminAccessTokenError: class MissingLinkAdminAccessTokenError extends Error {},
}));

import { db } from "@/db/drizzle";
import { listPeopleUsersByLinkIds } from "@/lib/link/user-lookup";
import { MissingLinkAdminAccessTokenError } from "@/lib/link/session";
import { useFlowList } from "./useFlowList";

const mockSelect = jest.mocked(db.select);
const mockListPeopleUsersByLinkIds = jest.mocked(listPeopleUsersByLinkIds);

describe("useFlowList", () => {
  beforeEach(() => {
    mockSelect.mockReset();
    mockListPeopleUsersByLinkIds.mockReset();
  });

  it("keeps flows available when a regular user has not authorized Link admin APIs", async () => {
    const mockWhere = jest.fn(() => ({ orderBy: jest.fn().mockResolvedValue([
      { id: 7, ownerId: 42, title: "Recruitment", isDeleted: false },
    ]) }));
    const mockFrom = jest.fn(() => ({ where: mockWhere }));
    const mockStepWhere = jest.fn().mockResolvedValue([]);
    const mockStepFrom = jest.fn(() => ({ where: mockStepWhere }));
    mockSelect
      .mockReturnValueOnce({ from: mockFrom } as never)
      .mockReturnValueOnce({ from: mockStepFrom } as never);
    mockListPeopleUsersByLinkIds.mockRejectedValue(
      new MissingLinkAdminAccessTokenError(),
    );

    await expect(useFlowList()).resolves.toEqual([
      expect.objectContaining({ id: 7, owner: "未知用户", steps: [] }),
    ]);
  });
});
