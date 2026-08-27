/** @jest-environment node */

const mockGetSession = jest.fn();
const mockRefreshLinkOAuthToken = jest.fn();
const mockUpdateLinkSessionTokens = jest.fn();

jest.mock("@/lib/link/client", () => ({
  shouldUseMockLink: () => false,
}));

jest.mock("@/lib/link/oauth", () => ({
  refreshLinkOAuthToken: (...args: unknown[]) => mockRefreshLinkOAuthToken(...args),
}));

jest.mock("@/lib/session", () => ({
  getSession: (...args: unknown[]) => mockGetSession(...args),
  updateLinkSessionTokens: (...args: unknown[]) => mockUpdateLinkSessionTokens(...args),
}));

import {
  getLinkAccessTokenFromSession,
  getLinkAdminAccessTokenFromSession,
} from "./session";

const expiredSession = {
  id: "session-1",
  linkAccessToken: "old-access",
  linkRefreshToken: "old-refresh",
  linkAccessTokenExpiresAt: new Date(Date.now() - 1_000),
  linkAdminAccessToken: "old-access",
  linkAdminRefreshToken: null,
  linkAdminAccessTokenExpiresAt: new Date(Date.now() - 1_000),
};

describe("Link session token refresh", () => {
  beforeEach(() => {
    mockGetSession.mockReset();
    mockRefreshLinkOAuthToken.mockReset();
    mockUpdateLinkSessionTokens.mockReset();
  });

  it("shares one refresh request across concurrent session and admin lookups", async () => {
    mockGetSession.mockResolvedValue(expiredSession);
    let resolveRefresh!: (value: {
      access_token: string;
      refresh_token: string;
      expires_in: number;
    }) => void;
    mockRefreshLinkOAuthToken.mockReturnValue(
      new Promise((resolve) => {
        resolveRefresh = resolve;
      }),
    );

    const sessionTokenPromise = getLinkAccessTokenFromSession();
    const adminTokenPromise = getLinkAdminAccessTokenFromSession();
    await Promise.resolve();
    resolveRefresh({
      access_token: "new-access",
      refresh_token: "new-refresh",
      expires_in: 3_600,
    });

    await expect(Promise.all([sessionTokenPromise, adminTokenPromise])).resolves.toEqual([
      "new-access",
      "new-access",
    ]);
    expect(mockRefreshLinkOAuthToken).toHaveBeenCalledTimes(1);
    expect(mockUpdateLinkSessionTokens).toHaveBeenCalledTimes(1);
  });

  it("uses a token persisted by another refresh when the stale request fails", async () => {
    const latestSession = {
      ...expiredSession,
      linkAccessToken: "new-access",
      linkRefreshToken: "new-refresh",
      linkAccessTokenExpiresAt: new Date(Date.now() + 3_600_000),
    };
    mockGetSession
      .mockResolvedValueOnce(expiredSession)
      .mockResolvedValueOnce(latestSession);
    mockRefreshLinkOAuthToken.mockRejectedValue(new Error("invalid refresh token"));

    await expect(getLinkAccessTokenFromSession()).resolves.toBe("new-access");
    expect(mockUpdateLinkSessionTokens).not.toHaveBeenCalled();
  });
});
