"use server";

import { revalidatePath } from "next/cache";
import { getSession, writeViewAsCookie } from "@/lib/session";
import { ADMIN_ROLE, FRESHMAN_ROLE, LECTURER_ROLE, MANAGER_ROLE } from "@/lib/link/role";
import { departmentCategory, departmentKey } from "@/const/department";
import { writeOperationAudit } from "@/lib/operation-audit";

/**
 * 管理员「切换身份查看」：以任意角色 + 任意部门的视角浏览系统，
 * 方便检查各部门实际看到的界面与数据范围。
 *
 * 只改写浏览器上的临时视角 cookie（加密），会话本身、uid 与 Link token 都不变，
 * 因此随时可以一键切回管理员；视角 cookie 只对管理员会话生效，伪造也提不了权。
 */

export type ViewAsInput = {
  role: number;
  /** 仅部员 / 讲师 / 部长需要部门 */
  department?: string | null;
};

const assignableRole = (role: number) =>
  Number.isInteger(role) && role >= FRESHMAN_ROLE && role <= ADMIN_ROLE;

const requiresDepartment = (role: number) =>
  role >= 1 && role <= MANAGER_ROLE;

/** 办公部门没有讲师这一级；客户端下拉会禁用，这里再挡一次 */
const roleAvailableIn = (role: number, department: string | null) =>
  !(
    role === LECTURER_ROLE &&
    department !== null &&
    departmentCategory(department) === "office"
  );

export async function startViewAs({ role, department }: ViewAsInput) {
  const session = await getSession();
  if (!session) throw new Error("会话已失效，请重新登录");
  if (session.realRole < ADMIN_ROLE) {
    throw new Error("只有管理员可以切换身份查看");
  }
  if (!assignableRole(role)) {
    throw new Error("身份不合法");
  }

  const nextDepartment = requiresDepartment(role)
    ? departmentKey(department)
    : null;
  if (requiresDepartment(role) && !nextDepartment) {
    throw new Error("请选择要查看的部门");
  }
  if (!roleAvailableIn(role, nextDepartment)) {
    throw new Error("办公部门没有讲师身份，请选择部员或部长");
  }

  /* 切回管理员 = 退出临时视角 */
  await writeViewAsCookie(
    role === ADMIN_ROLE ? null : { role, department: nextDepartment },
  );

  await writeOperationAudit({
    actorId: session.uid,
    actorRole: session.realRole,
    action: "session.view-as.start",
    resourceType: "session",
    resourceId: session.uid,
    department: nextDepartment,
    metadata: { role, department: nextDepartment },
  });

  revalidatePath("/dashboard", "layout");
}

export async function stopViewAs() {
  const session = await getSession();
  if (!session) return;
  if (session.realRole < ADMIN_ROLE) {
    throw new Error("只有管理员可以退出切换身份");
  }

  await writeViewAsCookie(null);

  await writeOperationAudit({
    actorId: session.uid,
    actorRole: session.realRole,
    action: "session.view-as.stop",
    resourceType: "session",
    resourceId: session.uid,
    metadata: { role: session.role, department: session.department },
  });

  revalidatePath("/dashboard", "layout");
}
