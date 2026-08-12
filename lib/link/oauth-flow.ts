import "server-only";

import {
  IS_BINDING,
  LINK_OAUTH_PURPOSE,
  LINK_OAUTH_STATE,
} from "@/const/cookie";
import { getPublicBaseUrl } from "@/lib/app-url";
import {
  createLinkOAuthUrl,
  getLinkAdminOAuthScopes,
  getLinkOAuthClientId,
  getLinkOAuthScopes,
  type LinkOAuthPurpose,
} from "@/lib/link/oauth";
import { cookies } from "next/headers";
import crypto from "node:crypto";

const base64UrlEncode = (value: Buffer) => value.toString("base64url");

export const requiresLinkAdminAuthorization = (peopleRole: number) =>
  peopleRole >= 2;

export const getLinkOAuthRedirectUri = () =>
  `${process.env.NODE_ENV === "development" ? "http://localhost:3001" : getPublicBaseUrl()}/api/auth/link`;

export const createLinkOAuthAuthorizationUrl = async (
  purpose: LinkOAuthPurpose,
  isBinding = false,
) => {
  const codeVerifier = base64UrlEncode(crypto.randomBytes(32));
  const state = base64UrlEncode(crypto.randomBytes(24));
  const codeChallenge = base64UrlEncode(
    crypto.createHash("sha256").update(codeVerifier).digest(),
  );
  const cookieStore = await cookies();

  cookieStore.set("link_code_verifier", codeVerifier, {
    path: "/",
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 600,
  });
  cookieStore.set(LINK_OAUTH_STATE, state, {
    path: "/",
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 600,
  });
  cookieStore.set(LINK_OAUTH_PURPOSE, purpose, {
    path: "/",
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 600,
  });
  if (isBinding) {
    cookieStore.set(IS_BINDING, "1", {
      path: "/",
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      maxAge: 600,
    });
  }

  const url = createLinkOAuthUrl("/oauth/authorize");
  url.searchParams.set("client_id", getLinkOAuthClientId(purpose));
  url.searchParams.set("code_challenge", codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("redirect_uri", getLinkOAuthRedirectUri());
  url.searchParams.set("response_type", "code");
  url.searchParams.set(
    "scope",
    purpose === "admin" ? getLinkAdminOAuthScopes() : getLinkOAuthScopes(),
  );
  url.searchParams.set("state", state);

  return url.toString();
};
