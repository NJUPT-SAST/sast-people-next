import "server-only";

import { flow, userFlow } from "@/db/schema";
import { canAccessDepartment, DepartmentAccessError, type DepartmentScope } from "@/lib/authz";
import { eq, or, sql, type SQL } from "drizzle-orm";

/**
 * 与当前账号部门相关的流程：
 * - 管理员：全部流程；
 * - 部门账号：本部门流程（flow.department = 我的部门），
 *   以及「全局流程中已有本部门报名记录」的流程（例如跨部门共享的统一招新流程）；
 * - 未归属部门的流程（department IS NULL）对本部门不可见，除非其中已存在本部门报名记录。
 *
 * 用于「阅卷 / 笔试管理 / 面试管理」的流程选择器与流程详情读取；
 * 流程管理列表与候选人报名入口使用全量列表（见 `useFlowList`）。
 */
export const visibleFlowPredicate = (
  scope: DepartmentScope,
): SQL<unknown> | undefined => {
  if (scope.kind === "all") return undefined;
  if (scope.kind === "none") return sql`false`;

  return or(
    eq(flow.department, scope.department),
    sql`(
      ${flow.department} IS NULL
      AND EXISTS (
        SELECT 1 FROM ${userFlow}
        WHERE ${userFlow.fkFlowId} = ${flow.id}
          AND ${userFlow.department} = ${scope.department}
      )
    )`,
  );
};

/** 流程本身的编辑权（标题/步骤/题目/发布）：只有流程归属部门或管理员 */
export const canEditFlow = (
  scope: DepartmentScope,
  department: string | null | undefined,
) => canAccessDepartment(scope, department);

export const assertFlowEditable = (
  scope: DepartmentScope,
  department: string | null | undefined,
  message = "无权修改其他部门的流程",
) => {
  if (!canEditFlow(scope, department)) {
    throw new DepartmentAccessError(message);
  }
};

/** 候选人所在的报名记录必须属于当前 scope（管理员放行） */
export const assertUserFlowInScope = (
  scope: DepartmentScope,
  department: string | null | undefined,
  message = "无权操作其他部门的候选人",
) => {
  if (!canAccessDepartment(scope, department)) {
    throw new DepartmentAccessError(message);
  }
};

/** 报名记录归属解析：组别映射优先，其次流程归属部门 */
export const resolveUserFlowDepartment = (
  groupDepartments: Record<string, string> | null | undefined,
  applyGroup: string | null | undefined,
  flowDepartment: string | null | undefined,
): string | null => {
  const mapped = applyGroup ? groupDepartments?.[applyGroup] : undefined;
  const resolved = mapped ?? flowDepartment ?? null;
  const trimmed = resolved?.trim();
  return trimmed ? trimmed.slice(0, 64) : null;
};
