import {
  exchangeLinkOAuthCode,
  getLinkAdminOAuthScopes,
  getLinkOAuthScopes,
  refreshLinkOAuthToken,
} from "@/lib/link/oauth";

describe("Link OAuth token client", () => {
  const fetchMock = jest.fn().mockResolvedValue(
      {
        ok: true,
        json: async () => ({
          access_token: "access",
          refresh_token: "refresh",
          token_type: "Bearer",
          expires_in: 3600,
          scope: "openid profile",
        }),
      },
    );

  beforeEach(() => {
    global.fetch = fetchMock as typeof fetch;
    fetchMock.mockClear();
    process.env.LINK_CLIENT_ID = "client-id";
    process.env.LINK_AUTH_BASE_URL = "https://link.example/v2";
    delete process.env.LINK_OAUTH_SCOPES;
    delete process.env.LINK_ADMIN_OAUTH_SCOPES;
  });

  it("uses user-read scopes for login and adds admin scopes only for management", () => {
    expect(getLinkOAuthScopes()).toBe("openid profile email user:read");
    expect(getLinkAdminOAuthScopes()).toBe(
      "openid profile email user:read admin:read admin:write",
    );
  });

  it("uses the RFC 6749 form encoding for authorization-code exchange", async () => {
    await exchangeLinkOAuthCode("auth code", "verifier", "https://people.example/cb");

    const [, init] = fetchMock.mock.calls[0];
    expect(init?.headers).toMatchObject({
      "Content-Type": "application/x-www-form-urlencoded",
    });
    expect(init?.body).toBe(
      "grant_type=authorization_code&code=auth+code&redirect_uri=https%3A%2F%2Fpeople.example%2Fcb&client_id=client-id&code_verifier=verifier",
    );
  });

  it("uses the same form contract for refresh", async () => {
    await refreshLinkOAuthToken("refresh-token");
    const [, init] = fetchMock.mock.calls[0];
    expect(init?.body).toBe(
      "grant_type=refresh_token&refresh_token=refresh-token&client_id=client-id",
    );
  });
});
