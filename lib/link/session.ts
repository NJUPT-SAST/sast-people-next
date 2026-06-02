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

export const canUseLegacyUserFallback = () =>
  process.env.NODE_ENV !== "production" &&
  process.env.LINK_ALLOW_LEGACY_FALLBACK === "true";

export const getLinkAccessTokenFromSession = async () => {
  if (shouldUseMockLink()) {
    return "mock-link-access-token";
  }

  const cookieStore = await cookies();
  const cookie = cookieStore.get(SESSION)?.value;
  const session = (await decrypt(cookie)) as LinkSessionPayload | null;

  if (!session) {
    throw new MissingLinkAccessTokenError();
  }

  const token = session?.linkAccessToken ?? session?.accessToken;
  const refreshToken = session?.linkRefreshToken ?? session?.refreshToken;
  const expiresAt =
    session?.linkAccessTokenExpiresAt ?? session?.accessTokenExpiresAt;

  if (typeof token !== "string" || token.length === 0) {
    throw new MissingLinkAccessTokenError();
  }

  if (shouldRefreshLinkToken(expiresAt)) {
    if (typeof refreshToken !== "string" || refreshToken.length === 0) {
      throw new MissingLinkAccessTokenError();
    }

    const refreshed = await refreshLinkOAuthToken(refreshToken);
    const refreshedAccessToken = refreshed.access_token;
    await updateLinkTokensInSession(cookieStore, session, {
      accessToken: refreshedAccessToken,
      refreshToken: refreshed.refresh_token ?? refreshToken,
      accessTokenExpiresAt: Date.now() + refreshed.expires_in * 1000,
    });

    return refreshedAccessToken;
  }

  return token;
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
    throw new MissingLinkAccessTokenError();
  }

  const expiresAt =
    typeof session.expiresAt === "string" || session.expiresAt instanceof Date
      ? new Date(session.expiresAt)
      : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  const encrypted = await encrypt({
    uid: session.uid,
    role: session.role,
    name: session.name,
    expiresAt,
    linkAccessToken: linkTokens.accessToken,
    linkRefreshToken: linkTokens.refreshToken,
    linkAccessTokenExpiresAt: linkTokens.accessTokenExpiresAt,
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
