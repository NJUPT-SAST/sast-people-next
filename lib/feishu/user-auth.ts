import "server-only";

import { getFeishuClient } from "@/lib/feishu/client";

type FeishuTokenResponse = {
  code?: number;
  msg?: string;
  data?: {
    name?: string;
    avatar_url?: string;
    open_id?: string;
    union_id?: string;
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    refresh_expires_in?: number;
  };
};

export type FeishuUserToken = {
  name?: string;
  avatar?: string;
  openId: string;
  unionId: string;
  accessToken: string;
  refreshToken?: string;
  accessTokenExpiresAt: Date;
  refreshTokenExpiresAt?: Date;
};

function normalizeTokenResponse(res: FeishuTokenResponse): FeishuUserToken {
  const data = res.data;
  if (!data?.access_token || !data.open_id || !data.union_id) {
    throw new Error(`get feishu user access token failed: ${res.msg ?? res.code ?? "unknown"}`);
  }

  return {
    name: data.name,
    avatar: data.avatar_url,
    openId: data.open_id,
    unionId: data.union_id,
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    accessTokenExpiresAt: new Date(Date.now() + (data.expires_in ?? 7200) * 1000),
    refreshTokenExpiresAt: data.refresh_expires_in
      ? new Date(Date.now() + data.refresh_expires_in * 1000)
      : undefined,
  };
}

export async function exchangeFeishuOAuthCode(code: string) {
  const res = await getFeishuClient().authen.accessToken.create({
    data: {
      grant_type: "authorization_code",
      code,
    },
  });
  return normalizeTokenResponse(res as FeishuTokenResponse);
}

export async function refreshFeishuUserAccessToken(refreshToken: string) {
  const res = await getFeishuClient().authen.refreshAccessToken.create({
    data: {
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    },
  });
  return normalizeTokenResponse(res as FeishuTokenResponse);
}
