/** @jest-environment node */

import type { ReactNode } from "react";

jest.mock("@/lib/dal", () => ({ verifySession: jest.fn() }));
jest.mock("@/lib/session", () => ({ getSession: jest.fn() }));
jest.mock("@/lib/link/client", () => ({ shouldUseMockLink: jest.fn() }));
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
const { getSession: mockGetSession } = jest.requireMock("@/lib/session") as {
  getSession: jest.Mock;
};
const { shouldUseMockLink: mockShouldUseMockLink } = jest.requireMock(
  "@/lib/link/client",
) as { shouldUseMockLink: jest.Mock };
const { redirect: mockRedirect } = jest.requireMock("next/navigation") as {
  redirect: jest.Mock;
};

describe("DashboardLayout", () => {
  beforeEach(() => {
    mockVerifySession.mockReset();
    mockGetSession.mockReset();
    mockRedirect.mockReset();
    mockShouldUseMockLink.mockReset();
    mockVerifySession.mockResolvedValue({ uid: 1, role: 3, name: "Admin" });
    mockGetSession.mockResolvedValue({ linkAdminAccessToken: null });
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
});
