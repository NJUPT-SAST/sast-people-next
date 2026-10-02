jest.mock("@/db/drizzle", () => ({ db: { select: jest.fn() } }));
jest.mock("@/lib/authz", () => ({
  getDepartmentScope: jest.fn(async () => ({ kind: "all" })),
}));
jest.mock("@/lib/flow-access", () => ({
  visibleFlowPredicate: jest.fn(() => undefined),
}));
jest.mock("@/lib/link/user-lookup", () => ({
  listPeopleUsersByLinkIds: jest.fn(),
}));
jest.mock("@/lib/link/session", () => ({
  MissingLinkAdminAccessTokenError: class MissingLinkAdminAccessTokenError extends Error {},
}));
jest.mock("@/lib/link/client", () => ({
  isLinkAuthorizationError: jest.fn(() => false),
}));

import { db } from "@/db/drizzle";
import { getDepartmentScope } from "@/lib/authz";
import { visibleFlowPredicate } from "@/lib/flow-access";
import { listPeopleUsersByLinkIds } from "@/lib/link/user-lookup";
import { MissingLinkAdminAccessTokenError } from "@/lib/link/session";
import { isLinkAuthorizationError } from "@/lib/link/client";
import { useDepartmentFlowList, useFlowList } from "@/hooks/useFlowList";

const mockSelect = jest.mocked(db.select);
const mockListPeopleUsersByLinkIds = jest.mocked(listPeopleUsersByLinkIds);
const mockIsLinkAuthorizationError = jest.mocked(isLinkAuthorizationError);
const mockGetDepartmentScope = jest.mocked(getDepartmentScope);
const mockVisibleFlowPredicate = jest.mocked(visibleFlowPredicate);
describe("useFlowList", () => {
  beforeEach(() => {
    mockSelect.mockReset();
    mockListPeopleUsersByLinkIds.mockReset();
    mockIsLinkAuthorizationError.mockReset();
    mockIsLinkAuthorizationError.mockReturnValue(false);
  });

  it("keeps flows available when a regular user has not authorized Link admin APIs", async () => {
    const mockWhere = jest.fn(() => ({ orderBy: jest.fn().mockResolvedValue([
      { id: 7, ownerId: 42, title: "Recruitment", isDeleted: false },
    ]) }));
    const mockFrom = jest.fn(() => ({ where: mockWhere }));
    const mockStepOrderBy = jest.fn().mockResolvedValue([]);
    const mockStepWhere = jest.fn(() => ({ orderBy: mockStepOrderBy }));
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

  it("scopes the department flow list and leaves the global one unfiltered", async () => {
    const mockOrderBy = jest.fn().mockResolvedValue([]);
    const mockWhere = jest.fn(() => ({ orderBy: mockOrderBy }));
    mockSelect.mockReturnValue({ from: jest.fn(() => ({ where: mockWhere })) } as never);
    mockGetDepartmentScope.mockResolvedValue({ kind: "department", department: "software" });

    await useFlowList();
    expect(mockVisibleFlowPredicate).not.toHaveBeenCalled();

    await useDepartmentFlowList();
    expect(mockVisibleFlowPredicate).toHaveBeenCalledWith({
      kind: "department",
      department: "software",
    });
  });

  it("keeps flows available when Link rejects the admin request", async () => {
    const mockWhere = jest.fn(() => ({ orderBy: jest.fn().mockResolvedValue([
      { id: 8, ownerId: 42, title: "Recruitment", isDeleted: false },
    ]) }));
    const mockFrom = jest.fn(() => ({ where: mockWhere }));
    const mockStepOrderBy = jest.fn().mockResolvedValue([]);
    const mockStepWhere = jest.fn(() => ({ orderBy: mockStepOrderBy }));
    const mockStepFrom = jest.fn(() => ({ where: mockStepWhere }));
    mockSelect
      .mockReturnValueOnce({ from: mockFrom } as never)
      .mockReturnValueOnce({ from: mockStepFrom } as never);
    mockListPeopleUsersByLinkIds.mockRejectedValue(new Error("无权限"));
    mockIsLinkAuthorizationError.mockReturnValue(true);

    await expect(useFlowList()).resolves.toEqual([
      expect.objectContaining({ id: 8, owner: "未知用户", steps: [] }),
    ]);
  });

  it("propagates Link lookup failures other than missing admin authorization", async () => {
    const lookupError = new Error("Link is unavailable");
    const mockWhere = jest.fn(() => ({ orderBy: jest.fn().mockResolvedValue([]) }));
    mockSelect.mockReturnValueOnce({
      from: jest.fn(() => ({ where: mockWhere })),
    } as never);
    mockListPeopleUsersByLinkIds.mockRejectedValue(lookupError);

    await expect(useFlowList()).rejects.toThrow(lookupError);
  });
});
