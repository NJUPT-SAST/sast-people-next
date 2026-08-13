import "server-only";

import { shouldUseMockLink } from "@/lib/link/client";
import { refreshLinkOAuthToken } from "@/lib/link/oauth";
import { getSession, updateLinkSessionTokens } from "@/lib/session";

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

  const token =
    purpose === "admin" ? session.linkAdminAccessToken : session.linkAccessToken;
  const refreshToken =
    purpose === "admin" ? session.linkAdminRefreshToken : session.linkRefreshToken;
  const expiresAt =
    purpose === "admin"
      ? session.linkAdminAccessTokenExpiresAt
      : session.linkAccessTokenExpiresAt;

  if (!token) return throwMissingTokenError(purpose);

  if (!shouldRefreshLinkToken(expiresAt)) return token;
  if (!refreshToken) return throwMissingTokenError(purpose);

  const refreshed = await refreshLinkOAuthToken(refreshToken, purpose);
  await updateLinkSessionTokens(session.id, purpose, {
    accessToken: refreshed.access_token,
    refreshToken: refreshed.refresh_token ?? refreshToken,
    accessTokenExpiresAt: Date.now() + refreshed.expires_in * 1000,
  });
  return refreshed.access_token;
};

const throwMissingTokenError = (purpose: "session" | "admin"): never => {
  if (purpose === "admin") throw new MissingLinkAdminAccessTokenError();
  throw new MissingLinkAccessTokenError();
};

const shouldRefreshLinkToken = (expiresAt: Date | null | undefined) =>
  !expiresAt || expiresAt.getTime() <= Date.now() + 60 * 1000;
