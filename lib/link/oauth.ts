import "server-only";

export type LinkOAuthTokenResponse = {
  access_token: string;
  refresh_token?: string;
  token_type: "Bearer";
  expires_in: number;
  scope?: string;
  id_token?: string;
};

/**
 * Link OAuth 端点返回非 2xx 时的结构化错误：保留 HTTP status 与 OAuth `error`
 * 字段，调用方据此区分「终态（如 refresh token 已被整族撤销）」与瞬时错误。
 */
export class LinkOAuthTokenError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly oauthError: string | null,
  ) {
    super(message);
    this.name = "LinkOAuthTokenError";
  }
}

/**
 * Link 契约：refresh 返回 `400 invalid_grant` 即终态 —— 角色变更 / 密码变更 /
 * 封禁 / 注销都会整族撤销 refresh token，且不可恢复。此时继续拿同一个 refresh
 * token 重试只会无限循环，必须清除本地凭据并重新走 authorize。
 */
export const isLinkRefreshTokenRevokedError = (error: unknown) =>
  error instanceof LinkOAuthTokenError &&
  error.status === 400 &&
  error.oauthError === "invalid_grant";

const getLinkOAuthClient = () => {
  const clientId = process.env.LINK_CLIENT_ID;
  const clientSecret = process.env.LINK_CLIENT_SECRET;

  if (!clientId) {
    throw new Error("LINK_CLIENT_ID environment variable is not set");
  }

  return { clientId, clientSecret };
};

export const getLinkOAuthClientId = () => getLinkOAuthClient().clientId;

export const getLinkOAuthBaseUrl = () => {
  const baseUrl =
    process.env.LINK_AUTH_BASE_URL ||
    process.env.LINK_API_BASE_URL ||
    "https://link.sast.fun";
  return baseUrl.replace(/\/$/, "");
};

export const getLinkOAuthScopes = () =>
  process.env.LINK_OAUTH_SCOPES || "openid profile email user:read";

export const getLinkAdminOAuthScopes = () =>
  process.env.LINK_ADMIN_OAUTH_SCOPES ||
  `${getLinkOAuthScopes()} admin:read admin:write`;

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
    throw new LinkOAuthTokenError(
      message,
      response.status,
      typeof payload?.error === "string" ? payload.error : null,
    );
  }

  return payload as LinkOAuthTokenResponse;
};

export const exchangeLinkOAuthCode = async (
  code: string,
  codeVerifier: string,
  redirectUri: string,
) => {
  const { clientId, clientSecret } = getLinkOAuthClient();

  return requestLinkOAuthToken({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    client_id: clientId,
    ...(clientSecret
      ? { client_secret: clientSecret }
      : {}),
    code_verifier: codeVerifier,
  });
};

export const refreshLinkOAuthToken = async (
  refreshToken: string,
) => {
  const { clientId, clientSecret } = getLinkOAuthClient();

  return requestLinkOAuthToken({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: clientId,
    ...(clientSecret
      ? { client_secret: clientSecret }
      : {}),
  });
};
