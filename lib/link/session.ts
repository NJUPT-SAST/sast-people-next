import "server-only";

import { SESSION } from "@/const/cookie";
import { decrypt, encrypt } from "@/lib/session";
import { shouldUseMockLink } from "@/lib/link/client";
import { refreshLinkOAuthToken } from "@/lib/link/oauth";
import { cookies } from "next/headers";
import type { ReadonlyRequestCookies } from "next/dist/server/web/spec-extension/adapters/request-cookies";

type LinkSessionPayload = {
  uid?: unknown;
  role?: unknown;
  name?: unknown;
  expiresAt?: unknown;
  linkAccessToken?: unknown;
  linkRefreshToken?: unknown;
  linkAccessTokenExpiresAt?: unknown;
  linkAdminAccessToken?: unknown;
  linkAdminRefreshToken?: unknown;
  linkAdminAccessTokenExpiresAt?: unknown;
  accessToken?: unknown;
  refreshToken?: unknown;
  accessTokenExpiresAt?: unknown;
};

export class MissingLinkAccessTokenError extends Error {
  constructor() {
    super(
      "Link access token is missing from session. Migrate Link login before calling Link admin APIs.",
    );
    this.name = "MissingLinkAccessTokenError";
  }
}

export class MissingLinkAdminAccessTokenError extends Error {
  constructor() {
    super("Link admin authorization is required before calling Link admin APIs.");
    this.name = "MissingLinkAdminAccessTokenError";
  }
}

export const canUseLegacyUserFallback = () =>
  process.env.NODE_ENV !== "production" &&
  process.env.LINK_ALLOW_LEGACY_FALLBACK === "true";

export const getLinkAccessTokenFromSession = async (): Promise<string> => {
  return getLinkTokenFromSession("session");
};

export const getLinkAdminAccessTokenFromSession = async (): Promise<string> => {
  return getLinkTokenFromSession("admin");
};

const getLinkTokenFromSession = async (
  purpose: "session" | "admin",
): Promise<string> => {
  if (shouldUseMockLink()) {
    return "mock-link-access-token";
  }

  const cookieStore = await cookies();
  const cookie = cookieStore.get(SESSION)?.value;
  const session = (await decrypt(cookie)) as LinkSessionPayload | null;

  if (!session) {
    return throwMissingTokenError(purpose);
  }

  const token =
    purpose === "admin"
      ? session.linkAdminAccessToken
      : session.linkAccessToken ?? session.accessToken;
  const refreshToken =
    purpose === "admin"
      ? session.linkAdminRefreshToken
      : session.linkRefreshToken ?? session.refreshToken;
  const expiresAt =
    purpose === "admin"
      ? session.linkAdminAccessTokenExpiresAt
      : session.linkAccessTokenExpiresAt ?? session.accessTokenExpiresAt;

  if (typeof token !== "string" || token.length === 0) {
    return throwMissingTokenError(purpose);
  }

  if (shouldRefreshLinkToken(expiresAt)) {
    if (typeof refreshToken !== "string" || refreshToken.length === 0) {
      return throwMissingTokenError(purpose);
    }

    const refreshed = await refreshLinkOAuthToken(refreshToken);
    const refreshedAccessToken = refreshed.access_token;
    await updateLinkTokensInSession(cookieStore, session, purpose, {
      accessToken: refreshedAccessToken,
      refreshToken: refreshed.refresh_token ?? refreshToken,
      accessTokenExpiresAt: Date.now() + refreshed.expires_in * 1000,
    });

    return refreshedAccessToken;
  }

  return token;
};

const throwMissingTokenError = (purpose: "session" | "admin"): never => {
  if (purpose === "admin") {
    throw new MissingLinkAdminAccessTokenError();
  }
  throw new MissingLinkAccessTokenError();
};

const shouldRefreshLinkToken = (expiresAt: unknown) => {
  if (typeof expiresAt !== "number") {
    return false;
  }
  return expiresAt <= Date.now() + 60 * 1000;
};

const updateLinkTokensInSession = async (
  cookieStore: ReadonlyRequestCookies,
  session: LinkSessionPayload,
  purpose: "session" | "admin",
  linkTokens: {
    accessToken: string;
    refreshToken?: string;
    accessTokenExpiresAt: number;
  },
) => {
  if (
    typeof session.uid !== "number" ||
    typeof session.role !== "number" ||
    typeof session.name !== "string"
  ) {
    return throwMissingTokenError(purpose);
  }

  const expiresAt =
    typeof session.expiresAt === "string" || session.expiresAt instanceof Date
      ? new Date(session.expiresAt)
      : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  const encrypted = await encrypt({
    uid: session.uid as number,
    role: session.role as number,
    name: session.name as string,
    expiresAt,
    linkAccessToken:
      purpose === "session"
        ? linkTokens.accessToken
        : typeof session.linkAccessToken === "string"
          ? session.linkAccessToken
          : undefined,
    linkRefreshToken:
      purpose === "session"
        ? linkTokens.refreshToken
        : typeof session.linkRefreshToken === "string"
          ? session.linkRefreshToken
          : undefined,
    linkAccessTokenExpiresAt:
      purpose === "session"
        ? linkTokens.accessTokenExpiresAt
        : typeof session.linkAccessTokenExpiresAt === "number"
          ? session.linkAccessTokenExpiresAt
          : undefined,
    linkAdminAccessToken:
      purpose === "admin"
        ? linkTokens.accessToken
        : typeof session.linkAdminAccessToken === "string"
          ? session.linkAdminAccessToken
          : undefined,
    linkAdminRefreshToken:
      purpose === "admin"
        ? linkTokens.refreshToken
        : typeof session.linkAdminRefreshToken === "string"
          ? session.linkAdminRefreshToken
          : undefined,
    linkAdminAccessTokenExpiresAt:
      purpose === "admin"
        ? linkTokens.accessTokenExpiresAt
        : typeof session.linkAdminAccessTokenExpiresAt === "number"
          ? session.linkAdminAccessTokenExpiresAt
          : undefined,
  });

  try {
    cookieStore.set(SESSION, encrypted, {
      httpOnly: process.env.NODE_ENV === "production",
      secure: true,
      expires: expiresAt,
      sameSite: "lax",
      path: "/",
    });
  } catch {
    // Server Component renders cannot always mutate cookies. The refreshed
    // access token is still returned to the current request.
  }
};
