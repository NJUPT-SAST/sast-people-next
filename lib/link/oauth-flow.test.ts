/** @jest-environment node */

const mockCookieStore = { set: jest.fn() };

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

});
