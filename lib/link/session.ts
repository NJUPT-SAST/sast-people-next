import "server-only";

import { shouldUseMockLink } from "@/lib/link/client";
import { mockAccessTokenFor } from "@/lib/link/mock";
import { refreshLinkOAuthToken, isLinkRefreshTokenRevokedError } from "@/lib/link/oauth";
import { clearLinkSessionTokens, getSession, updateLinkSessionTokens } from "@/lib/session";

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
  if (shouldUseMockLink()) {
    /* 本地 mock 用 token 标记登录用户，保证多账号演示时资料与部门不串号 */
    const mockSession = await getSession();
    return mockSession ? mockAccessTokenFor(mockSession.uid) : "mock-link-access-token";
  }

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
  const refreshPromise =
    existingRefresh ??
    refreshLinkToken({
      sessionId: session.id,
      storagePurpose,
      refreshToken,
    });
  if (!existingRefresh) refreshInFlight.set(refreshKey, refreshPromise);
  try {
    return await refreshPromise;
  } catch (error) {
    /* admin 请求在没有自己的 refresh token 时复用登录 token，两类请求会共享同一次
       刷新（同一个 refreshInFlight key），但撤销错误必须按各自 purpose 转换，才能
       进入对应的重新授权分支（session → /login，admin → /api/auth/link/start）。 */
    if (isLinkRefreshTokenRevokedError(error)) throwMissingTokenError(purpose);
    throw error;
  } finally {
    if (!existingRefresh && refreshInFlight.get(refreshKey) === refreshPromise) {
      refreshInFlight.delete(refreshKey);
    }
  }
};

/* 读取另一实例可能已刷新并写回、且仍然可用的 access token；读不到或仍需刷新返回 null */
const readRotatedAccessToken = async (
  sessionId: string,
  storagePurpose: "session" | "admin",
): Promise<string | null> => {
  let latestSession: Awaited<ReturnType<typeof getSession>> = null;
  try {
    latestSession = await getSession({ includeLinkTokens: true });
  } catch {
    return null;
  }
  if (latestSession?.id !== sessionId) return null;

  const latestToken =
    storagePurpose === "admin"
      ? latestSession.linkAdminAccessToken
      : latestSession.linkAccessToken;
  const latestExpiresAt =
    storagePurpose === "admin"
      ? latestSession.linkAdminAccessTokenExpiresAt
      : latestSession.linkAccessTokenExpiresAt;
  return latestToken && !shouldRefreshLinkToken(latestExpiresAt)
    ? latestToken
    : null;
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
    const rotated = await readRotatedAccessToken(sessionId, storagePurpose);
    if (rotated) return rotated;

    // Link 整族撤销 refresh token 是终态（角色/密码变更、封禁、注销）：清掉本地死
    // token，让调用方走「缺 token」分支重新授权，而不是每个请求再打一次注定失败的
    // refresh。清理在行锁内以「刚失败的 refresh token 仍是当前存值」为条件，避免把
    // 另一实例刚轮换出来的新凭据一起清掉。
    if (isLinkRefreshTokenRevokedError(error)) {
      const cleared = await clearLinkSessionTokens(
        sessionId,
        storagePurpose,
        refreshToken,
      );
      if (!cleared) {
        // 期间已有实例写入并轮换出新凭据：复用它，不按失败处理。
        const reused = await readRotatedAccessToken(sessionId, storagePurpose);
        if (reused) return reused;
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
