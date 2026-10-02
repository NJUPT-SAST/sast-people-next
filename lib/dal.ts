import "server-only";

import { ForbiddenError } from "@/lib/access-error";
import { getSession } from "@/lib/session";
import { refreshSessionIdentityIfStale } from "@/lib/identity-refresh";
import { cache } from "react";
import { redirect } from "next/navigation";
import { isNextControlFlowError, logServerError } from "@/lib/server-error-log";

export const verifySession = cache(async () => {
  try {
    const session = await getSession();

    if (!session?.uid) {
      redirect("/login");
    }

    /* 只走 action / API 的请求不渲染 dashboard 布局，这里按 TTL 回源 Link 角色/部门。
       回源失败（Link 不可用等）只记日志，绝不让请求变成 500。 */
    let current = session;
    try {
      if (await refreshSessionIdentityIfStale()) {
        /* 本请求内也立即用同步后的角色/部门判定，别让降权后的第一个请求还按旧角色放行 */
        current = (await getSession()) ?? session;
      }
    } catch (err) {
      if (isNextControlFlowError(err)) throw err;
      logServerError("verifySession:identity-refresh", err, {
        action: "refresh-session-identity",
      });
    }

    const uid = Number(current.uid);

    return {
      isAuth: true,
      uid,
      role: current.role as number,
      /** 会话本身的真实角色：切换身份查看时仍是管理员本人 */
      realRole: current.realRole as number,
      /* 当前是否处于「切换身份查看」临时视角 */
      viewAs: current.viewAs,
      name: current.name as string,
      /* 授权判定用：Link 部门标识，null 表示没有部门归属 */
      department: current.department ?? null,
    };
  } catch (err) {
    if (isNextControlFlowError(err)) throw err;
    logServerError("verifySession", err, {
      action: "verify-session",
    });
    throw err;
  }
});

export const verifyRole = cache(async (role: number) => {
  const session = await verifySession();
  if (session.role < role) {
    throw new ForbiddenError("Unauthorized operation");
  }
  return session;
});
