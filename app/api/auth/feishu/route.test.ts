/** @jest-environment node */

const mockCookieStore = {
  get: jest.fn(),
  delete: jest.fn(),
};
const mockVerifySession = jest.fn();
const mockExchangeFeishuOAuthCode = jest.fn();
const mockGetLinkAccessTokenFromSession = jest.fn();
const mockGetCurrentUserProfile = jest.fn();
const mockLogServerError = jest.fn();
const mockUpsertFeishuOAuthAccount = jest.fn();
const mockSendFeishuOAuthBoundCard = jest.fn();
const mockRedirect = jest.fn();

jest.mock("next/headers", () => ({
  cookies: jest.fn(async () => mockCookieStore),
}));
jest.mock("@/lib/app-url", () => ({
  getPublicBaseUrl: () => "https://people.sast.fun",
}));
jest.mock("@/lib/dal", () => ({
  verifySession: () => mockVerifySession(),
}));
jest.mock("@/lib/feishu/user-auth", () => ({
  exchangeFeishuOAuthCode: (code: string) => mockExchangeFeishuOAuthCode(code),
}));
jest.mock("@/lib/link/client", () => ({
  shouldUseLinkFeishuTestMock: () => false,
}));
jest.mock("@/lib/link/session", () => ({
  getLinkAccessTokenFromSession: () => mockGetLinkAccessTokenFromSession(),
}));
jest.mock("@/lib/link/user", () => ({
  getCurrentUserProfile: (accessToken: string) => mockGetCurrentUserProfile(accessToken),
}));
jest.mock("@/lib/feishu/oauth-account", () => ({
  upsertFeishuOAuthAccount: (...args: unknown[]) => mockUpsertFeishuOAuthAccount(...args),
}));
jest.mock("@/lib/feishu/interview-message", () => ({
  sendFeishuOAuthBoundCard: (...args: unknown[]) => mockSendFeishuOAuthBoundCard(...args),
}));
jest.mock("@/lib/server-error-log", () => ({
  logServerError: (...args: unknown[]) => mockLogServerError(...args),
}));
jest.mock("next/navigation", () => ({
  redirect: (path: string) => mockRedirect(path),
}));

import { NextRequest } from "next/server";
import { GET } from "./route";

describe("Feishu OAuth callback", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCookieStore.get.mockImplementation((name: string) =>
      name === "feishu_oauth_state" ? { value: "expected-state" } : undefined,
    );
    mockVerifySession.mockResolvedValue({ uid: 1, role: 2 });
    mockExchangeFeishuOAuthCode.mockResolvedValue({ unionId: "union-id" });
    mockGetLinkAccessTokenFromSession.mockResolvedValue("link-access-token");
    mockGetCurrentUserProfile.mockResolvedValue({ identities: [] });
  });

  it("redirects Link identities missing Feishu binding to the public People URL", async () => {
    const request = new NextRequest(
      "https://0.0.0.0:3003/api/auth/feishu?code=authorization-code&state=expected-state",
    );

    const response = await GET(request);

    expect(response.headers.get("location")).toBe(
      "https://people.sast.fun/dashboard?feishuOAuth=link_identity_missing",
    );
    expect(mockCookieStore.delete).toHaveBeenCalledWith("feishu_oauth_state");
  });

  it("returns to the dashboard page that initiated authorization", async () => {
    mockCookieStore.get.mockImplementation((name: string) => {
      if (name === "feishu_oauth_state") return { value: "expected-state" };
      if (name === "feishu_oauth_return_to") {
        return { value: "/dashboard/interviews?flowId=12" };
      }
      return undefined;
    });
    mockGetCurrentUserProfile.mockResolvedValue({
      identities: [{ provider: "lark", provider_id: "union-id" }],
    });
    mockExchangeFeishuOAuthCode.mockResolvedValue({
      unionId: "union-id",
      openId: "open-id",
    });

    await GET(
      new NextRequest(
        "https://people.sast.fun/api/auth/feishu?code=authorization-code&state=expected-state",
      ),
    );

    expect(mockRedirect).toHaveBeenCalledWith("/dashboard/interviews?flowId=12");
    expect(mockCookieStore.delete).toHaveBeenCalledWith("feishu_oauth_return_to");
  });
});
