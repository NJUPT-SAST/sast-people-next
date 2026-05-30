import "server-only";

import { linkFetch } from "@/lib/link/client";

export type LinkOAuthTokenResponse = {
  access_token: string;
  refresh_token?: string;
  token_type: "Bearer";
  expires_in: number;
  scopes?: string;
};

export const getLinkOAuthBaseUrl = () => {
  const baseUrl =
    process.env.LINK_AUTH_BASE_URL ||
    process.env.LINK_API_BASE_URL ||
    "https://link.sast.fun";
  return baseUrl.replace(/\/$/, "");
};

export const getLinkOAuthScopes = () =>
  process.env.LINK_OAUTH_SCOPES || "openid profile";

export const exchangeLinkOAuthCode = async (
  code: string,
  codeVerifier: string,
  redirectUri: string,
) => {
  const clientId = process.env.LINK_CLIENT_ID;
  if (!clientId) {
    throw new Error("LINK_CLIENT_ID environment variable is not set");
  }

  return linkFetch<LinkOAuthTokenResponse>("/oauth/token", {
    method: "POST",
    body: {
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      client_id: clientId,
      ...(process.env.LINK_CLIENT_SECRET
        ? { client_secret: process.env.LINK_CLIENT_SECRET }
        : {}),
      code_verifier: codeVerifier,
    },
  });
};

export const refreshLinkOAuthToken = async (refreshToken: string) => {
  const clientId = process.env.LINK_CLIENT_ID;
  if (!clientId) {
    throw new Error("LINK_CLIENT_ID environment variable is not set");
  }

  return linkFetch<LinkOAuthTokenResponse>("/oauth/token", {
    method: "POST",
    body: {
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: clientId,
      ...(process.env.LINK_CLIENT_SECRET
        ? { client_secret: process.env.LINK_CLIENT_SECRET }
        : {}),
    },
  });
};
