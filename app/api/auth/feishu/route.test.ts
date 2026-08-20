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
  upsertFeishuOAuthAccount: jest.fn(),
}));
jest.mock("@/lib/feishu/interview-message", () => ({
  sendFeishuOAuthBoundCard: jest.fn(),
}));
jest.mock("@/lib/server-error-log", () => ({
  logServerError: (...args: unknown[]) => mockLogServerError(...args),
}));

import { NextRequest } from "next/server";
import { GET } from "./route";

describe("Feishu OAuth callback", () => {
  beforeEach(() => {
    mockCookieStore.get.mockReturnValue({ value: "expected-state" });
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
});
