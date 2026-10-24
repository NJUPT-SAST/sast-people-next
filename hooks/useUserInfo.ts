import { verifySession, type VerifiedSession } from "../lib/dal";
import type { userType } from "@/types/user";
import { cache } from "react";
import { redirect } from "next/navigation";
import { isNextControlFlowError, logServerError } from "@/lib/server-error-log";
import { isLinkAuthorizationError } from "@/lib/link/client";
import { getCurrentUserProfileWithRefresh } from "@/lib/link/user";
import { MissingLinkAccessTokenError } from "@/lib/link/session";
import { toPeopleUserFromLinkProfile } from "@/lib/link/people-user";

/**
 * Link 不可用时的降级资料：只保留会话里已有的身份字段。
 * 资料展示属于只读元数据，不能因为 Link 超时把整个 dashboard 渲染打挂。
 */
const toPeopleUserFromSession = (session: VerifiedSession): userType => ({
  id: session.uid,
  name: session.name,
  studentId: null,
  email: null,
  phone: null,
  college: null,
  major: null,
  departments: session.department ? [session.department] : [],
  github: null,
  blog: null,
  personalStatement: null,
  qq: null,
  role: session.role,
  createdAt: new Date(0),
  updatedAt: new Date(0),
  isDeleted: false,
  profileUnavailable: true,
});

export const useUserInfo = cache(async (): Promise<userType> => {
  try {
    const session = await verifySession();
    try {
      const userInfo = await getCurrentUserProfileWithRefresh();
      if (!userInfo) {
        redirect('/login');
      }
      return toPeopleUserFromLinkProfile(userInfo, {
        canViewPhone: true,
        canViewQq: true,
      });
    } catch (err) {
      if (isNextControlFlowError(err)) throw err;
      if (err instanceof MissingLinkAccessTokenError) {
        redirect('/login');
      }
      if (isLinkAuthorizationError(err)) {
        redirect("/api/auth/logout?reason=link-authorization");
      }
      /* Link 超时 / DNS / 连接被拒等瞬时故障：记录后降级展示，
         与 verifySession 的「回源失败不制造 500」保持一致。 */
      console.error("useUserInfo error:", err);
      logServerError('dashboard:useUserInfo', err, {
        path: '/dashboard',
        action: 'load-current-user',
      });
      return toPeopleUserFromSession(session);
    }
  } catch (err) {
    if (isNextControlFlowError(err)) throw err;
    console.error("useUserInfo error:", err);
    logServerError('dashboard:useUserInfo', err, {
      path: '/dashboard',
      action: 'load-current-user',
    });
    throw err;
  }
});
