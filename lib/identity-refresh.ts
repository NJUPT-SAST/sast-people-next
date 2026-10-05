import "server-only";

import { getLinkAccessTokenFromSession, MissingLinkAccessTokenError } from "@/lib/link/session";
import { toPeopleUserFromLinkProfile } from "@/lib/link/people-user";
import { getCurrentUserProfile } from "@/lib/link/user";
import {
  getSession,
  isIdentitySyncStale,
  syncCurrentSessionIdentity,
} from "@/lib/session";

/**
 * 会话身份（角色 + 部门）按需回源 Link。
 *
 * 以前只有 dashboard 布局会回源，只走 server action / API 的会话（不渲染布局）
 * 会一直拿着过期的 people_session.role / department；这里把它挪到 verifySession
 * 内，并且只在从未同步或超过 TTL 时拉一次 profile，保证 ≤5 分钟跟上 Link 的角色变化。
 */
export async function refreshSessionIdentityIfStale(): Promise<boolean> {
  const session = await getSession();
  if (!session) return false;
  if (!isIdentitySyncStale(session.departmentSyncedAt)) return false;

  let accessToken: string;
  try {
    accessToken = await getLinkAccessTokenFromSession();
  } catch (error) {
    /* 没有 Link token 的会话（例如 People 本地登录/测试账号）没有资料可回源，
       当作「无需同步」而不是错误，避免每个请求都记一条日志。 */
    if (error instanceof MissingLinkAccessTokenError) return false;
    throw error;
  }
  const linkProfile = await getCurrentUserProfile(accessToken);
  if (!linkProfile) return false;

  /* 与 hooks/useUserInfo 同一套换算：Link 原始 profile → People 角色 + 部门列表 */
  const profile = toPeopleUserFromLinkProfile(linkProfile, {
    canViewPhone: false,
    canViewQq: false,
  });

  await syncCurrentSessionIdentity({
    role: profile.role ?? session.realRole,
    department: profile.departments[0] ?? null,
  });
  return true;
}
