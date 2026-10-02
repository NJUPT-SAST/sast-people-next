/** @jest-environment node */

import type { ReactElement, ReactNode } from "react";

jest.mock("server-only", () => ({}));
jest.mock("@/lib/dal", () => ({ verifySession: jest.fn() }));
jest.mock("@/hooks/useUserInfo", () => ({ useUserInfo: jest.fn() }));
jest.mock("@/lib/session", () => ({
  getSession: jest.fn(),
  syncCurrentSessionIdentity: jest.fn(),
}));
jest.mock("@/lib/link/client", () => ({
  shouldUseMockLink: jest.fn(),
  isLinkAuthorizationError: jest.fn(() => false),
}));
jest.mock("next/navigation", () => ({ redirect: jest.fn() }));
jest.mock("@/components/dashboard-layout", () => ({
  DashboardLayout: ({ children }: { children: ReactNode }) => children,
}));
jest.mock("@/components/userCard", () => ({ UserCard: () => null }));
jest.mock("@/components/route", () => ({ PageBreadcrumb: () => null }));

import DashboardLayout from "./layout";

const { verifySession: mockVerifySession } = jest.requireMock("@/lib/dal") as {
  verifySession: jest.Mock;
};
const { getSession: mockGetSession, syncCurrentSessionIdentity: mockSyncIdentity } =
  jest.requireMock("@/lib/session") as {
    getSession: jest.Mock;
    syncCurrentSessionIdentity: jest.Mock;
  };
const { shouldUseMockLink: mockShouldUseMockLink } = jest.requireMock(
  "@/lib/link/client",
) as { shouldUseMockLink: jest.Mock };
const { useUserInfo: mockGetUserInfo } = jest.requireMock(
  "@/hooks/useUserInfo",
) as { useUserInfo: jest.Mock };
const { redirect: mockRedirect } = jest.requireMock("next/navigation") as {
  redirect: jest.Mock;
};

describe("DashboardLayout", () => {
  beforeEach(() => {
    mockVerifySession.mockReset();
    mockGetSession.mockReset();
    mockSyncIdentity.mockReset();
    mockRedirect.mockReset();
    mockShouldUseMockLink.mockReset();
    mockGetUserInfo.mockReset();
    mockVerifySession.mockResolvedValue({ uid: 1, role: 4, name: "Admin" });
    mockGetSession.mockResolvedValue({ role: 4, linkAdminAccessToken: null });
    mockGetUserInfo.mockResolvedValue({ id: 1, role: 4, departments: [] });
  });

  it("does not start real Link OAuth for a local mock administrator", async () => {
    mockShouldUseMockLink.mockReturnValue(true);

    await DashboardLayout({ children: "content" });

    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it("requires Link admin authorization outside mock mode", async () => {
    mockShouldUseMockLink.mockReturnValue(false);

    await DashboardLayout({ children: "content" });

    expect(mockRedirect).toHaveBeenCalledWith("/api/auth/link/start");
  });

  it("把回源同步后的角色与部门传给导航外壳", async () => {
    mockShouldUseMockLink.mockReturnValue(true);
    mockGetUserInfo.mockResolvedValue({ id: 1, role: 4, departments: ["software"] });
    mockGetSession.mockResolvedValue({
      role: 4,
      department: "software",
      linkAdminAccessToken: null,
    });

    const element = (await DashboardLayout({ children: "content" })) as ReactElement<{
      department: string | null;
      role: number;
    }>;

    /* 身份回源已挪到 verifySession 内按 TTL 执行，布局不再自己同步 */
    expect(mockSyncIdentity).not.toHaveBeenCalled();
    expect(element.props.role).toBe(4);
    expect(element.props.department).toBe("software");
    /* 管理员标记已随本地管理员名单移除，导航外壳不再接收 isAdmin */
    expect("isAdmin" in element.props).toBe(false);
  });
});
