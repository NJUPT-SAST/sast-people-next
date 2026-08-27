import "server-only";

import { shouldUseMockLink } from "@/lib/link/client";
import { refreshLinkOAuthToken } from "@/lib/link/oauth";
import { getSession, updateLinkSessionTokens } from "@/lib/session";

// Multiple RSC requests can resume at the same time after a period of inactivity.
// Keep one refresh request in flight per session/token purpose so a rotated refresh
// token is not spent twice concurrently.
const refreshInFlight = new Map<string, Promise<string>>();

export class MissingLinkAccessTokenError extends Error {
  constructor() {
    super("Link access token is missing from the server session.");
    this.name = "MissingLinkAccessTokenError";
  }
}

export class MissingLinkAdminAccessTokenError extends Error {
  constructor() {
    super("Link admin authorization is required before calling Link admin APIs.");
    this.name = "MissingLinkAdminAccessTokenError";
  }
}

export const getLinkAccessTokenFromSession = async (): Promise<string> =>
  getLinkTokenFromSession("session");

export const getLinkAdminAccessTokenFromSession = async (): Promise<string> =>
  getLinkTokenFromSession("admin");

const getLinkTokenFromSession = async (
  purpose: "session" | "admin",
): Promise<string> => {
  if (shouldUseMockLink()) return "mock-link-access-token";

  const session = await getSession({ includeLinkTokens: true });
  if (!session) return throwMissingTokenError(purpose);

  const usesSessionTokenForAdmin =
    purpose === "admin" && !session.linkAdminRefreshToken;
  const token =
    purpose === "admin" && !usesSessionTokenForAdmin
      ? session.linkAdminAccessToken
      : session.linkAccessToken;
  const refreshToken =
    purpose === "admin" && !usesSessionTokenForAdmin
      ? session.linkAdminRefreshToken
      : session.linkRefreshToken;
  const expiresAt =
    purpose === "admin" && !usesSessionTokenForAdmin
      ? session.linkAdminAccessTokenExpiresAt
      : session.linkAccessTokenExpiresAt;

  if (!token) return throwMissingTokenError(purpose);

  if (!shouldRefreshLinkToken(expiresAt)) return token;
  if (!refreshToken) return throwMissingTokenError(purpose);

  const storagePurpose = usesSessionTokenForAdmin ? "session" : purpose;
  const refreshKey = `${session.id}:${storagePurpose}`;
  const existingRefresh = refreshInFlight.get(refreshKey);
  if (existingRefresh) return existingRefresh;

  const refreshPromise = refreshLinkToken({
    sessionId: session.id,
    storagePurpose,
    refreshToken,
  });
  refreshInFlight.set(refreshKey, refreshPromise);
  try {
    return await refreshPromise;
  } finally {
    if (refreshInFlight.get(refreshKey) === refreshPromise) {
      refreshInFlight.delete(refreshKey);
    }
  }
};

const refreshLinkToken = async ({
  sessionId,
  storagePurpose,
  refreshToken,
}: {
  sessionId: string;
  storagePurpose: "session" | "admin";
  refreshToken: string;
}) => {
  try {
    const refreshed = await refreshLinkOAuthToken(refreshToken);
    await updateLinkSessionTokens(sessionId, storagePurpose, {
      accessToken: refreshed.access_token,
      refreshToken: refreshed.refresh_token ?? refreshToken,
      accessTokenExpiresAt: Date.now() + refreshed.expires_in * 1000,
    });
    return refreshed.access_token;
  } catch (error) {
    // Another application instance may have refreshed and rotated the token
    // between our read and refresh request. Reuse that newer credential when it
    // is already persisted; otherwise preserve the original error.
    let latestSession: Awaited<ReturnType<typeof getSession>> = null;
    try {
      latestSession = await getSession({ includeLinkTokens: true });
    } catch {
      throw error;
    }
    if (latestSession?.id === sessionId) {
      const latestToken =
        storagePurpose === "admin"
          ? latestSession.linkAdminAccessToken
          : latestSession.linkAccessToken;
      const latestExpiresAt =
        storagePurpose === "admin"
          ? latestSession.linkAdminAccessTokenExpiresAt
          : latestSession.linkAccessTokenExpiresAt;
      if (latestToken && !shouldRefreshLinkToken(latestExpiresAt)) {
        return latestToken;
      }
    }
    throw error;
  }
};

const throwMissingTokenError = (purpose: "session" | "admin"): never => {
  if (purpose === "admin") throw new MissingLinkAdminAccessTokenError();
  throw new MissingLinkAccessTokenError();
};

const shouldRefreshLinkToken = (expiresAt: Date | null | undefined) =>
  !expiresAt || expiresAt.getTime() <= Date.now() + 60 * 1000;
