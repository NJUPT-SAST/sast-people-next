jest.mock("@/lib/dal", () => ({
  verifyRole: jest.fn().mockResolvedValue({ uid: 1, role: 3 }),
}));
jest.mock("@/lib/link/admin", () => ({
  getLinkUserDetail: jest.fn(),
  updateLinkUserRole: jest.fn(),
}));
jest.mock("@/lib/link/session", () => ({
  getLinkAdminAccessTokenFromSession: jest.fn(),
}));
jest.mock("@/lib/operation-audit", () => ({ writeOperationAudit: jest.fn() }));
jest.mock("@/lib/server-error-log", () => ({ logServerError: jest.fn() }));
jest.mock("next/cache", () => ({ revalidatePath: jest.fn() }));

import { updateUserRole } from "@/action/user/updateRole";

const { getLinkUserDetail: mockGetLinkUserDetail, updateLinkUserRole: mockUpdateLinkUserRole } =
  jest.requireMock("@/lib/link/admin") as {
    getLinkUserDetail: jest.Mock;
    updateLinkUserRole: jest.Mock;
  };
const { getLinkAdminAccessTokenFromSession: mockGetLinkAdminAccessTokenFromSession } =
  jest.requireMock("@/lib/link/session") as {
    getLinkAdminAccessTokenFromSession: jest.Mock;
  };
const { writeOperationAudit: mockWriteOperationAudit } =
  jest.requireMock("@/lib/operation-audit") as { writeOperationAudit: jest.Mock };
const { revalidatePath: mockRevalidatePath } =
  jest.requireMock("next/cache") as { revalidatePath: jest.Mock };

describe("updateUserRole", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetLinkAdminAccessTokenFromSession.mockResolvedValue("admin-token");
  });

  it("refuses to change an administrator role through People", async () => {
    mockGetLinkUserDetail.mockResolvedValue({ role: "admin" });

    await expect(updateUserRole(42, 2)).rejects.toThrow(
      "管理员身份只能通过数据库手动变更",
    );

    expect(mockUpdateLinkUserRole).not.toHaveBeenCalled();
    expect(mockWriteOperationAudit).not.toHaveBeenCalled();
    expect(mockRevalidatePath).not.toHaveBeenCalled();
  });

  it("continues to allow non-administrator role changes", async () => {
    mockGetLinkUserDetail.mockResolvedValue({ role: "member" });

    await updateUserRole(42, 2);

    expect(mockUpdateLinkUserRole).toHaveBeenCalledWith(
      "admin-token",
      42,
      "lecturer",
    );
  });
});
