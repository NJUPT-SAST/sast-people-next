/** @jest-environment node */

jest.mock("server-only", () => ({}));
jest.mock("react", () => ({
  ...jest.requireActual("react"),
  cache: (fn: unknown) => fn,
}));
jest.mock("@/hooks/useUserInfo", () => ({ useUserInfo: jest.fn() }));
jest.mock("@/components/route", () => ({
  PageHeader: ({ children }: { children: React.ReactNode }) => children,
  PageTitle: () => "Dashboard",
}));
jest.mock("@/components/ui/button", () => ({
  Button: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock("@/components/ui/card", () => ({
  Card: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock("@/components/ui/skeleton", () => ({ Skeleton: () => null }));
jest.mock("@/components/feishu-oauth-failure-dialog", () => ({
  FeishuOAuthFailureDialog: () => null,
}));
jest.mock("@/components/userInfo/showQrCode", () => ({ ShowQrCode: () => null }));
jest.mock("@/components/linkLogin", () => ({ LinkLogin: () => null }));
jest.mock("./basicInfo", () => ({ BasicInfoServer: () => null }));
jest.mock("./experienceInfo", () => ({ ExperienceInfoServer: () => null }));

import { renderToStaticMarkup } from "react-dom/server";
import Home from "./page";

const { useUserInfo: mockGetUserInfo } = jest.requireMock(
  "@/hooks/useUserInfo",
) as { useUserInfo: jest.Mock };

describe("dashboard page", () => {
  it("shows a Link outage notice instead of the new-student onboarding", async () => {
    mockGetUserInfo.mockResolvedValue({
      id: 7,
      name: "Alice",
      studentId: null,
      email: null,
      phone: null,
      college: null,
      major: null,
      departments: ["software"],
      github: null,
      blog: null,
      personalStatement: null,
      qq: null,
      role: 0,
      createdAt: new Date(0),
      updatedAt: new Date(0),
      isDeleted: false,
      profileUnavailable: true,
    });

    const html = renderToStaticMarkup(
      await Home({ searchParams: Promise.resolve({}) }),
    );

    expect(html).toContain("SAST Link 暂时不可用");
    expect(html).not.toContain("Welcome to SAST People");
  });
});
