import "server-only";

import { DEPARTMENT_LABELS } from "@/const/department";
import { departmentKeySchema, normalizeDepartmentKey } from "@/db/schema";
import { DepartmentAccessError, type DepartmentScope } from "@/lib/authz";
import { isNull, type AnyColumn, type SQL } from "drizzle-orm";

/**
 * 邮件模板的部门维度：
 * - `department IS NULL` = 全局默认（仅管理员可写）；
 * - `department = <Link 部门标识>` = 该部门的覆盖，渲染时优先于全局默认；
 * - 部门账号（role 3 + 部门 scope）可读全局默认与任意部门的覆盖，但只能写自己的覆盖。
 *
 * 办公类部门面试招新的模板（`office_round1.*` / `office_round2.*`）与其它模板完全一致：
 * 每个办公部门一条 `office_interview` 流程，模板按流程归属部门存部门覆盖行。
 *
 * 读与写的范围并不对称：部门账号可以只读浏览任意部门的覆盖文案（便于对比与抄改），
 * 但写权限只有本部门覆盖行（`canEditTemplateRow`），全局默认行始终仅管理员可写。
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

/**
 * 读取范围：
 * - 管理员不过滤；
 * - 部门账号可读全部（跨部门只读浏览，写权限仍由 `canEditTemplateRow` 限制在本部门）；
 * - 无部门账号只看全局默认。
 */
export const templateReadFilter = (
  column: AnyColumn,
  scope: DepartmentScope,
): SQL<unknown> | undefined => {
  switch (scope.kind) {
    case "all":
    case "department":
      return undefined;
    case "none":
      return isNull(column);
  }
};

/**
 * 读取入口的范围校验：与 `templateReadFilter` 保持一致。
 * 管理员与部门账号都能读取任意部门（部门账号是只读浏览），
 * 无部门账号只能读全局默认，避免越权读到别的部门文案。
 */
export const canReadTemplateDepartment = (
  scope: DepartmentScope,
  department: string | null | undefined,
): boolean => {
  if (scope.kind === "none") return normalizeDepartmentKey(department) === null;
  return true;
};

/**
 * 模板归属下拉选项：Link 部门目录 ∪ 库中已出现覆盖的部门。
 * 只依赖库内已有行会让管理员/部长在别的部门还没建过覆盖时无从选择，
 * 因此目录里的部门始终列出（手填新标识仍保留给管理员）。
 */
export const mergeTemplateDepartmentOptions = (
  storedDepartments: Array<string | null | undefined>,
): string[] => {
  const keys = new Set<string>(Object.keys(DEPARTMENT_LABELS));
  for (const value of storedDepartments) {
    const key = normalizeDepartmentKey(value);
    if (key) keys.add(key);
  }
  return [...keys].sort((a, b) => a.localeCompare(b, "zh-CN"));
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
