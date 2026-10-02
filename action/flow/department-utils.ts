import "server-only";

import {
  flowGroupDepartmentsSchema,
  flowGroupOptionsSchema,
  normalizeDepartmentKey,
} from "@/db/schema";
import type { DepartmentScope } from "@/lib/authz";

/** 流程写入入口的会话上下文（verifyScopedRole 的返回值） */
export type FlowScopedSession = {
  uid: number;
  role: number;
  /** 会话本身的真实角色（切换身份查看时仍是管理员本人），审计用 */
  realRole: number;
  name: string;
  department: string | null;
  scope: DepartmentScope;
};

/**
 * 流程归属部门解析：
 * - 管理员可指定任意部门（空值 = 全局流程，department 落 NULL）；
 * - 部长只能落在自己的部门，忽略入参。
 */
export const resolveFlowDepartment = (
  scope: DepartmentScope,
  input: unknown,
): string | null => {
  if (scope.kind === "all") return normalizeDepartmentKey(input);
  if (scope.kind === "department") return scope.department;
  return null;
};

/**
 * 组别 → 部门 映射清洗：只保留 flow.groupOptions 中存在的组别，部门标识统一规范化。
 * 无有效映射时返回 null（等价于不映射）。
 */
export const resolveGroupDepartments = (
  groupOptions: string[] | null | undefined,
  input: unknown,
): Record<string, string> | null => {
  const parsedOptions = flowGroupOptionsSchema.safeParse(groupOptions ?? []);
  if (!parsedOptions.success) {
    throw new Error("流程组别配置不合法");
  }

  const parsedMapping = flowGroupDepartmentsSchema.safeParse(input ?? {});
  if (!parsedMapping.success) {
    throw new Error("组别部门映射不合法");
  }

  const allowed = new Set(parsedOptions.data);
  const entries = Object.entries(parsedMapping.data)
    .filter(([group]) => allowed.has(group))
    .map(([group, value]) => [group, normalizeDepartmentKey(value)] as const)
    .filter((entry): entry is readonly [string, string] => entry[1] !== null);

  return entries.length > 0
    ? (Object.fromEntries(entries) as Record<string, string>)
    : null;
};
