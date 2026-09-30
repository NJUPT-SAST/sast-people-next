import "server-only";

import { getSession } from "@/lib/session";
import { cache } from "react";
import { redirect } from "next/navigation";
import { isNextControlFlowError, logServerError } from "@/lib/server-error-log";

export const verifySession = cache(async () => {
  try {
    const session = await getSession();

    if (!session?.uid) {
      redirect("/login");
    }

    const uid = Number(session.uid);

    return {
      isAuth: true,
      uid,
      role: session.role as number,
      /** 会话本身的真实角色：切换身份查看时仍是管理员本人 */
      realRole: session.realRole as number,
      /* 当前是否处于「切换身份查看」临时视角 */
      viewAs: session.viewAs,
      name: session.name as string,
      /* 授权判定用：Link 部门标识，null 表示没有部门归属 */
      department: session.department ?? null,
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
    throw new Error("Unauthorized operation");
  }
  return session;
});
