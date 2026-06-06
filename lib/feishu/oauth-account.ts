import "server-only";

import { db } from "@/db/drizzle";
import { userOAuthAccount } from "@/db/schema";
import { decryptSecret, encryptSecret } from "@/lib/secret";
import { and, eq } from "drizzle-orm";
import { refreshFeishuUserAccessToken, type FeishuUserToken } from "./user-auth";

const PROVIDER = "feishu";
const REFRESH_THRESHOLD_MS = 5 * 60 * 1000;

export type FeishuOAuthAccountStatus = {
  bound: boolean;
  providerUserId?: string;
  providerUnionId?: string | null;
  authorizationExpiresAt?: Date | null;
};

export async function getFeishuOAuthAccountStatus(
  linkUserId: number,
): Promise<FeishuOAuthAccountStatus> {
  const [account] = await db
    .select({
      providerUserId: userOAuthAccount.providerUserId,
      providerUnionId: userOAuthAccount.providerUnionId,
      accessTokenExpiresAt: userOAuthAccount.accessTokenExpiresAt,
      refreshTokenExpiresAt: userOAuthAccount.refreshTokenExpiresAt,
    })
    .from(userOAuthAccount)
    .where(
      and(
        eq(userOAuthAccount.fkUserId, linkUserId),
        eq(userOAuthAccount.provider, PROVIDER),
      ),
    )
    .limit(1);

  if (!account) return { bound: false };
  const authorizationExpiresAt =
    account.refreshTokenExpiresAt ?? account.accessTokenExpiresAt;
  const bound =
    !authorizationExpiresAt || authorizationExpiresAt.getTime() > Date.now();

  return {
    bound,
    providerUserId: account.providerUserId,
    providerUnionId: account.providerUnionId,
    authorizationExpiresAt,
  };
}

export async function upsertFeishuOAuthAccount(
  linkUserId: number,
  token: FeishuUserToken,
) {
  const values = {
    fkUserId: linkUserId,
    provider: PROVIDER,
    providerUserId: token.openId,
    providerUnionId: token.unionId,
    accessToken: encryptSecret(token.accessToken),
    refreshToken: token.refreshToken ? encryptSecret(token.refreshToken) : null,
    accessTokenExpiresAt: token.accessTokenExpiresAt,
    refreshTokenExpiresAt: token.refreshTokenExpiresAt,
    updatedAt: new Date(),
  };

  await db
    .insert(userOAuthAccount)
    .values(values)
    .onConflictDoUpdate({
      target: [userOAuthAccount.fkUserId, userOAuthAccount.provider],
      set: values,
    });
}

export async function getValidFeishuUserAccessToken(linkUserId: number) {
  return (await getValidFeishuUserCredential(linkUserId)).accessToken;
}

export async function getValidFeishuUserCredential(linkUserId: number) {
  const [account] = await db
    .select()
    .from(userOAuthAccount)
    .where(
      and(
        eq(userOAuthAccount.fkUserId, linkUserId),
        eq(userOAuthAccount.provider, PROVIDER),
      ),
    )
    .limit(1);

  if (!account) {
    throw new Error("请先绑定飞书账号后再发起面试日程。");
  }

  const accessExpiresAt = account.accessTokenExpiresAt?.getTime();
  if (!accessExpiresAt || accessExpiresAt > Date.now() + REFRESH_THRESHOLD_MS) {
    return {
      accessToken: decryptSecret(account.accessToken),
      openId: account.providerUserId,
      unionId: account.providerUnionId,
    };
  }

  if (!account.refreshToken) {
    throw new Error("飞书授权已过期，请重新绑定飞书账号。");
  }

  const refreshed = await refreshFeishuUserAccessToken(
    decryptSecret(account.refreshToken),
  );
  await upsertFeishuOAuthAccount(linkUserId, refreshed);
  return {
    accessToken: refreshed.accessToken,
    openId: refreshed.openId,
    unionId: refreshed.unionId,
  };
}
