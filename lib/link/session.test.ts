/** @jest-environment node */

const mockGetSession = jest.fn();
const mockRefreshLinkOAuthToken = jest.fn();
const mockUpdateLinkSessionTokens = jest.fn();
const mockClearLinkSessionTokens = jest.fn();

jest.mock("@/lib/link/client", () => ({
  shouldUseMockLink: () => false,
}));

jest.mock("@/lib/link/oauth", () => ({
  ...jest.requireActual("@/lib/link/oauth"),
  refreshLinkOAuthToken: (...args: unknown[]) => mockRefreshLinkOAuthToken(...args),
}));

jest.mock("@/lib/session", () => ({
  getSession: (...args: unknown[]) => mockGetSession(...args),
  updateLinkSessionTokens: (...args: unknown[]) => mockUpdateLinkSessionTokens(...args),
  clearLinkSessionTokens: (...args: unknown[]) => mockClearLinkSessionTokens(...args),
}));

import { LinkOAuthTokenError } from "@/lib/link/oauth";
import {
  getLinkAccessTokenFromSession,
  getLinkAdminAccessTokenFromSession,
  MissingLinkAccessTokenError,
  MissingLinkAdminAccessTokenError,
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
    mockClearLinkSessionTokens.mockReset();
    mockClearLinkSessionTokens.mockResolvedValue(true);
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

  it("refreshes a still-valid access token when Link reports it revoked", async () => {
    const freshSession = {
      ...expiredSession,
      linkAccessTokenExpiresAt: new Date(Date.now() + 3_600_000),
    };
    mockGetSession.mockResolvedValue(freshSession);
    mockRefreshLinkOAuthToken.mockResolvedValue({
      access_token: "new-access",
      refresh_token: "new-refresh",
      expires_in: 3_600,
    });

    await expect(
      getLinkAccessTokenFromSession({ forceRefresh: true }),
    ).resolves.toBe("new-access");
    expect(mockRefreshLinkOAuthToken).toHaveBeenCalledWith("old-refresh");
    expect(mockUpdateLinkSessionTokens).toHaveBeenCalledWith(
      "session-1",
      "session",
      expect.objectContaining({ accessToken: "new-access" }),
    );
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

  it("clears the session token when Link revokes the refresh token", async () => {
    mockGetSession.mockResolvedValue(expiredSession);
    mockRefreshLinkOAuthToken.mockRejectedValue(
      new LinkOAuthTokenError("refresh token revoked", 400, "invalid_grant"),
    );

    await expect(getLinkAccessTokenFromSession()).rejects.toBeInstanceOf(
      MissingLinkAccessTokenError,
    );
    expect(mockClearLinkSessionTokens).toHaveBeenCalledTimes(1);
    expect(mockClearLinkSessionTokens).toHaveBeenCalledWith(
      "session-1",
      "session",
      "old-refresh",
    );
  });

  it("clears the admin credentials when a one-pass admin refresh is revoked", async () => {
    const adminSession = { ...expiredSession, linkAdminRefreshToken: "dead-admin-refresh" };
    mockGetSession.mockResolvedValue(adminSession);
    mockRefreshLinkOAuthToken.mockRejectedValue(
      new LinkOAuthTokenError("refresh token revoked", 400, "invalid_grant"),
    );

    await expect(getLinkAdminAccessTokenFromSession()).rejects.toBeInstanceOf(
      MissingLinkAdminAccessTokenError,
    );
    expect(mockClearLinkSessionTokens).toHaveBeenCalledTimes(1);
    expect(mockClearLinkSessionTokens).toHaveBeenCalledWith(
      "session-1",
      "admin",
      "dead-admin-refresh",
    );
  });

  it("gives each waiter the missing-token error for its own purpose", async () => {
    mockGetSession.mockResolvedValue(expiredSession);
    mockRefreshLinkOAuthToken.mockRejectedValue(
      new LinkOAuthTokenError("refresh token revoked", 400, "invalid_grant"),
    );

    const adminPromise = getLinkAdminAccessTokenFromSession();
    const sessionPromise = getLinkAccessTokenFromSession();

    await expect(adminPromise).rejects.toBeInstanceOf(
      MissingLinkAdminAccessTokenError,
    );
    await expect(sessionPromise).rejects.toBeInstanceOf(
      MissingLinkAccessTokenError,
    );
    expect(mockRefreshLinkOAuthToken).toHaveBeenCalledTimes(1);
    expect(mockClearLinkSessionTokens).toHaveBeenCalledTimes(1);
  });

  it("stops retrying Link once the revoked token has been cleared", async () => {
    let stored: {
      linkAccessToken: string | null;
      linkRefreshToken: string | null;
      linkAccessTokenExpiresAt: Date | null;
    } = {
      linkAccessToken: "old-access",
      linkRefreshToken: "old-refresh",
      linkAccessTokenExpiresAt: new Date(Date.now() - 1_000),
    };
    mockGetSession.mockImplementation(async () => ({ ...expiredSession, ...stored }));
    mockClearLinkSessionTokens.mockImplementation(async () => {
      stored = {
        linkAccessToken: null,
        linkRefreshToken: null,
        linkAccessTokenExpiresAt: null,
      };
      return true;
    });
    mockRefreshLinkOAuthToken.mockRejectedValue(
      new LinkOAuthTokenError("refresh token revoked", 400, "invalid_grant"),
    );

    await expect(getLinkAccessTokenFromSession()).rejects.toBeInstanceOf(
      MissingLinkAccessTokenError,
    );
    await expect(getLinkAccessTokenFromSession()).rejects.toBeInstanceOf(
      MissingLinkAccessTokenError,
    );

    expect(mockRefreshLinkOAuthToken).toHaveBeenCalledTimes(1);
  });

  it("keeps the token on transient refresh failures", async () => {
    mockGetSession.mockResolvedValue(expiredSession);
    const transientError = new LinkOAuthTokenError("upstream unavailable", 503, null);
    mockRefreshLinkOAuthToken.mockRejectedValue(transientError);

    await expect(getLinkAccessTokenFromSession()).rejects.toBe(transientError);
    expect(mockClearLinkSessionTokens).not.toHaveBeenCalled();
  });

  it("does not clear a token that another instance already rotated away from", async () => {
    const latestSession = {
      ...expiredSession,
      linkAccessToken: "new-access",
      linkRefreshToken: "new-refresh",
      linkAccessTokenExpiresAt: new Date(Date.now() + 3_600_000),
    };
    mockGetSession
      .mockResolvedValueOnce(expiredSession)
      .mockResolvedValueOnce(latestSession);
    mockRefreshLinkOAuthToken.mockRejectedValue(
      new LinkOAuthTokenError("refresh token revoked", 400, "invalid_grant"),
    );

    await expect(getLinkAccessTokenFromSession()).resolves.toBe("new-access");
    expect(mockClearLinkSessionTokens).not.toHaveBeenCalled();
  });

  it("reuses a credential written while the guarded clear was refused", async () => {
    const latestSession = {
      ...expiredSession,
      linkAccessToken: "new-access",
      linkRefreshToken: "new-refresh",
      linkAccessTokenExpiresAt: new Date(Date.now() + 3_600_000),
    };
    mockGetSession
      .mockResolvedValueOnce(expiredSession)
      .mockResolvedValueOnce(expiredSession)
      .mockResolvedValueOnce(latestSession);
    mockClearLinkSessionTokens.mockResolvedValue(false);
    mockRefreshLinkOAuthToken.mockRejectedValue(
      new LinkOAuthTokenError("refresh token revoked", 400, "invalid_grant"),
    );

    await expect(getLinkAccessTokenFromSession()).resolves.toBe("new-access");
    expect(mockClearLinkSessionTokens).toHaveBeenCalledWith(
      "session-1",
      "session",
      "old-refresh",
    );
  });
});
