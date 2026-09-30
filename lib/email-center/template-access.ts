import "server-only";

import { departmentKeySchema, normalizeDepartmentKey } from "@/db/schema";
import { DepartmentAccessError, type DepartmentScope } from "@/lib/authz";
import { eq, isNull, or, type AnyColumn, type SQL } from "drizzle-orm";

/**
 * 邮件模板的部门维度：
 * - `department IS NULL` = 全局默认（仅管理员可写）；
 * - `department = <Link 部门标识>` = 该部门的覆盖，渲染时优先于全局默认；
 * - 部门账号（role 3 + 部门 scope）只能读全局默认与自己的覆盖、只能写自己的覆盖。
 *
 * 办公类部门面试招新的模板（`office_round1.*` / `office_round2.*`）与其它模板完全一致：
 * 每个办公部门一条 `office_interview` 流程，模板按流程归属部门存部门覆盖行。
 */
export type TemplateEditTarget =
  | { kind: "global" }
  | { kind: "department"; department: string };

export const resolveTemplateEditTarget = (
  scope: DepartmentScope,
  requested: unknown,
): TemplateEditTarget => {
  const parsed = departmentKeySchema.safeParse(requested ?? "");
  const requestedDepartment = parsed.success
    ? normalizeDepartmentKey(parsed.data)
    : null;

  if (scope.kind === "all") {
    return requestedDepartment
      ? { kind: "department", department: requestedDepartment }
      : { kind: "global" };
  }

  if (scope.kind !== "department") {
    throw new DepartmentAccessError("当前账号未归属任何部门，无法管理邮件模板。");
  }

  if (requestedDepartment && requestedDepartment !== scope.department) {
    throw new DepartmentAccessError("无权管理其他部门的邮件模板");
  }

  return { kind: "department", department: scope.department };
};

/** 读取范围：管理员不过滤；部门账号看全局默认 + 本部门覆盖；无部门账号只看全局默认 */
export const templateReadFilter = (
  column: AnyColumn,
  scope: DepartmentScope,
): SQL<unknown> | undefined => {
  switch (scope.kind) {
    case "all":
      return undefined;
    case "department":
      return or(isNull(column), eq(column, scope.department));
    case "none":
      return isNull(column);
  }
};

export const canEditTemplateRow = (
  scope: DepartmentScope,
  department: string | null | undefined,
): boolean => {
  const target = normalizeDepartmentKey(department);
  if (scope.kind === "all") return true;
  if (scope.kind !== "department") return false;
  return target === scope.department;
};

/** 渲染取模板：部门覆盖优先，其次全局默认；都没有则由调用方回落到内置默认文案 */
export const pickTemplateSettingRow = <
  T extends { department: string | null },
>(
  rows: T[],
  department: string | null | undefined,
): T | null => {
  const target = normalizeDepartmentKey(department);
  if (target) {
    const scoped = rows.find((row) => row.department === target);
    if (scoped) return scoped;
  }

  return rows.find((row) => row.department === null) ?? null;
};
