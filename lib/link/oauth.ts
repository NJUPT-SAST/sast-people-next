import "server-only";

export type LinkOAuthTokenResponse = {
  access_token: string;
  refresh_token?: string;
  token_type: "Bearer";
  expires_in: number;
  scope?: string;
  id_token?: string;
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

export const createLinkOAuthUrl = (path: string) => {
  const baseUrl = getLinkOAuthBaseUrl();
  return new URL(`${baseUrl}${path.startsWith("/") ? path : `/${path}`}`);
};

const requestLinkOAuthToken = async (body: Record<string, string>) => {
  const form = new URLSearchParams(body);
  const response = await fetch(createLinkOAuthUrl("/oauth/token"), {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: form.toString(),
    cache: "no-store",
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      payload?.error_description ??
      payload?.message ??
      payload?.error ??
      `Link OAuth token request failed: ${response.status}`;
    throw new Error(message);
  }

  return payload as LinkOAuthTokenResponse;
};

export const exchangeLinkOAuthCode = async (
  code: string,
  codeVerifier: string,
  redirectUri: string,
) => {
  const clientId = process.env.LINK_CLIENT_ID;
  if (!clientId) {
    throw new Error("LINK_CLIENT_ID environment variable is not set");
  }

  return requestLinkOAuthToken({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    client_id: clientId,
    ...(process.env.LINK_CLIENT_SECRET
      ? { client_secret: process.env.LINK_CLIENT_SECRET }
      : {}),
    code_verifier: codeVerifier,
  });
};

export const refreshLinkOAuthToken = async (refreshToken: string) => {
  const clientId = process.env.LINK_CLIENT_ID;
  if (!clientId) {
    throw new Error("LINK_CLIENT_ID environment variable is not set");
  }

  return requestLinkOAuthToken({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: clientId,
    ...(process.env.LINK_CLIENT_SECRET
      ? { client_secret: process.env.LINK_CLIENT_SECRET }
      : {}),
  });
};
