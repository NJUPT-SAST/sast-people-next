import "server-only";

import { normalizeDepartmentKey } from "@/db/schema";
import { verifyRole, verifySession } from "@/lib/dal";
import { getSession } from "@/lib/session";
import { ADMIN_ROLE, MANAGER_ROLE } from "@/lib/link/role";
import { eq, type AnyColumn, type SQL, sql } from "drizzle-orm";
import { cache } from "react";

/**
 * 部门可见性模型（角色阶梯见 `lib/link/role.ts`）：
 * - 管理员（Link `admin`，role 4）→ 全部门 + 平台面（反馈、错误日志、部门管理、模板全局默认、封禁）；
 * - 部长（Link `manager`，role 3）/ 讲师 / 部员 → 仅本人所属部门（Link `profile.department`）；
 * - 无部门归属 → 看不到任何部门数据（严格模式）。
 * 未归属部门的数据（department IS NULL）只有管理员可见。
 */
export const isAdmin = (role: number): boolean => role >= ADMIN_ROLE;

export type DepartmentScope =
  | { kind: "all" }
  | { kind: "department"; department: string }
  | { kind: "none" };

export const getDepartmentScope = cache(async (): Promise<DepartmentScope> => {
  const session = await verifySession();
  if (isAdmin(session.role)) return { kind: "all" };

  /* 读最新会话而非 verifySession 的请求缓存：布局层已在本请求内回源同步过 Link 资料 */
  const latest = await getSession();
  const department = normalizeDepartmentKey(latest?.department ?? session.department);
  return department ? { kind: "department", department } : { kind: "none" };
});

/** 部门越权：调用方（route handler / action）据此区分 403 与一般错误 */
export class DepartmentAccessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DepartmentAccessError";
  }
}

export const canAccessDepartment = (
  scope: DepartmentScope,
  department: string | null | undefined,
): boolean => {
  if (scope.kind === "all") return true;

  const target = normalizeDepartmentKey(department);
  if (!target) return false;

  return scope.kind === "department" && scope.department === target;
};

export const assertDepartmentAccess = (
  scope: DepartmentScope,
  department: string | null | undefined,
  message = "无权访问其他部门的数据",
): void => {
  if (!canAccessDepartment(scope, department)) {
    throw new DepartmentAccessError(message);
  }
};

/** 行级过滤条件：all → undefined（不过滤）；department → 仅本部门；none → 恒假 */
export const departmentScopeFilter = (
  column: AnyColumn,
  scope: DepartmentScope,
): SQL<unknown> | undefined => {
  switch (scope.kind) {
    case "all":
      return undefined;
    case "department":
      return eq(column, scope.department);
    case "none":
      return sql`false`;
  }
};

/** 需要“角色能力 + 部门可见性”双重校验的服务端入口使用；无部门归属直接拒绝 */
export const verifyScopedRole = cache(async (role: number) => {
  const session = await verifyRole(role);
  const scope = await getDepartmentScope();

  if (scope.kind === "none") {
    throw new Error("当前账号未归属任何部门，请联系管理员分配部门。");
  }

  return { ...session, scope };
});

/** 部长及以上（部门管理面）：Link `manager` / `admin` */
export const verifyManager = cache(async () => verifyScopedRole(MANAGER_ROLE));

/** 管理员（平台面与跨部门）：Link `admin`（role 4） */
export const verifyAdmin = cache(async () => {
  const session = await verifySession();
  if (!isAdmin(session.role)) {
    throw new Error("仅管理员可执行该操作");
  }
  return session;
});
