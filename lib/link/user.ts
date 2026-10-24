import "server-only";

import { LinkApiError, linkFetch, shouldUseMockLink } from "@/lib/link/client";
import { getMockCurrentUserProfile } from "@/lib/link/mock";
import { getLinkAccessTokenFromSession } from "@/lib/link/session";
import type { LinkUserProfile } from "@/lib/link/types";

export const getCurrentUserProfile = async (accessToken: string) => {
  if (shouldUseMockLink()) {
    return getMockCurrentUserProfile(accessToken);
  }

  return linkFetch<LinkUserProfile>("/user/profile", { accessToken });
};

/**
 * 读当前账号资料：access token 被 Link 提前撤销（HTTP 401 / 业务码 4014905830）时
 * 强制刷新一次并重试，refresh token 也失效才会把错误抛给调用方。
 * 已经拿到 access token 的链路可以传入，避免重复读会话。
 */
export const getCurrentUserProfileWithRefresh = async (
  accessToken?: string,
) => {
  const token = accessToken ?? (await getLinkAccessTokenFromSession());
  try {
    return await getCurrentUserProfile(token);
  } catch (error) {
    if (
      !(
        error instanceof LinkApiError &&
        (error.status === 401 || error.code === 4014905830)
      )
    ) {
      throw error;
    }
    const refreshedToken = await getLinkAccessTokenFromSession({
      forceRefresh: true,
    });
    return getCurrentUserProfile(refreshedToken);
  }
};

