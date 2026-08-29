/** @jest-environment node */

const mockCookieStore = {
  get: jest.fn(),
  delete: jest.fn(),
};

jest.mock("next/headers", () => ({
  cookies: jest.fn(async () => mockCookieStore),
}));
jest.mock("@/lib/link/oauth-flow", () => ({
  getLinkOAuthRedirectUri: () => "http://localhost:3001/api/auth/link",
}));
jest.mock("@/lib/link/oauth", () => ({
  exchangeLinkOAuthCode: jest.fn(),
}));
jest.mock("@/lib/link/user", () => ({
  getCurrentUserProfile: jest.fn(),
}));
jest.mock("@/lib/link/role", () => ({
  linkRoleToPeopleRole: jest.fn(),
}));
jest.mock("@/lib/link/client", () => ({
  shouldUseLinkFeishuTestMock: () => false,
}));
jest.mock("@/lib/session", () => ({
  createSession: jest.fn(),
}));
jest.mock("@/lib/server-error-log", () => ({
  logServerError: jest.fn(),
}));

import { NextRequest } from "next/server";
import { GET } from "./route";

describe("Link OAuth callback", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("redirects denied OAuth authorization to the login error page", async () => {
    const request = new NextRequest(
      "http://localhost:3001/api/auth/link?error=access_denied&error_description=%E7%94%A8%E6%88%B7%E6%8B%92%E7%BB%9D%E6%8E%88%E6%9D%83&state=test-state",
    );

    const response = await GET(request);

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "http://localhost:3001/login?reason=link-denied",
    );
    expect(mockCookieStore.get).not.toHaveBeenCalled();
  });

  it("still rejects a callback without code and without an OAuth error", async () => {
    const request = new NextRequest(
      "http://localhost:3001/api/auth/link?state=test-state",
    );

    const response = await GET(request);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ message: "code is required" });
  });
});
