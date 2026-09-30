import "server-only";

import { departmentKeySchema, normalizeDepartmentKey } from "@/db/schema";
import { DepartmentAccessError, type DepartmentScope } from "@/lib/authz";
import { departmentCategory } from "@/const/department";
import { eq, isNull, or, type AnyColumn, type SQL } from "drizzle-orm";

/**
 * 邮件模板的部门维度：
 * - `department IS NULL` = 全局默认（仅管理员可写）；
 * - `department = <Link 部门标识>` = 该部门的覆盖，渲染时优先于全局默认；
 * - 部门账号（role 3 + 部门 scope）只能读全局默认与自己的覆盖、只能写自己的覆盖。
 */
export type TemplateEditTarget =
  | { kind: "global" }
  | { kind: "department"; department: string };

/* 办公类部门面试招新的邮件模板由办公部门统一维护：共享一份全局模板，不使用部门覆盖 */
const OFFICE_TEMPLATE_KEY_PREFIXES = ["office_round1.", "office_round2."] as const;

export const isOfficeTemplateKey = (templateKey: string | null | undefined) =>
  !!templateKey &&
  OFFICE_TEMPLATE_KEY_PREFIXES.some((prefix) => templateKey.startsWith(prefix));

const managesOfficeTemplates = (scope: DepartmentScope) =>
  scope.kind === "all" ||
  (scope.kind === "department" &&
    departmentCategory(scope.department) === "office");

export const resolveTemplateEditTarget = (
  scope: DepartmentScope,
  requested: unknown,
  templateKey?: string | null,
): TemplateEditTarget => {
  /* 办公类模板：任何办公部门账号都写同一份共享模板（全局行） */
  if (isOfficeTemplateKey(templateKey)) {
    if (!managesOfficeTemplates(scope)) {
      throw new DepartmentAccessError(
        "办公类部门面试招新邮件模板由办公部门统一管理。",
      );
    }
    return { kind: "global" };
  }

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
  templateKey?: string | null,
): boolean => {
  const target = normalizeDepartmentKey(department);
  /* 办公类共享模板只有一份全局行：办公部门账号均可编辑，部门覆盖行仅管理员可改 */
  if (isOfficeTemplateKey(templateKey)) {
    return target === null ? managesOfficeTemplates(scope) : scope.kind === "all";
  }
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
