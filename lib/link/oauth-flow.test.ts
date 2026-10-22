/** @jest-environment node */

const mockCookieStore = { set: jest.fn(), delete: jest.fn() };

jest.mock("next/headers", () => ({
  cookies: jest.fn(async () => mockCookieStore),
}));

jest.mock("@/lib/app-url", () => ({
  getPublicBaseUrl: () => "https://people.example",
}));

import { createLinkOAuthAuthorizationUrl } from "./oauth-flow";

describe("Link OAuth authorization flow", () => {
  beforeEach(() => {
    mockCookieStore.set.mockClear();
    mockCookieStore.delete.mockClear();
    process.env.LINK_CLIENT_ID = "client-id";
    delete process.env.LINK_OAUTH_SCOPES;
    delete process.env.LINK_ADMIN_OAUTH_SCOPES;
  });

  it("requests management scopes during the first grant", async () => {
    const url = new URL(await createLinkOAuthAuthorizationUrl());

    expect(url.searchParams.get("scope")).toBe(
      "openid profile email user:read admin:read admin:write",
    );
  });

  it("stores a safe internal return path for the login flow", async () => {
    await createLinkOAuthAuthorizationUrl(false, "/collect/abc?from=share");

    expect(mockCookieStore.set).toHaveBeenCalledWith(
      "login_next",
      "/collect/abc?from=share",
      expect.any(Object),
    );
  });

  it("drops protocol-relative return paths", async () => {
    await createLinkOAuthAuthorizationUrl(false, "//evil.example/path");

    expect(mockCookieStore.set).not.toHaveBeenCalledWith(
      "login_next",
      expect.anything(),
      expect.anything(),
    );
    expect(mockCookieStore.delete).toHaveBeenCalledWith("login_next");
  });
});
