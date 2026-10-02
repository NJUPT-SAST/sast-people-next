import "server-only";

import { db } from "@/db/drizzle";
import { flow, userFlow } from "@/db/schema";
import { canAccessDepartment, DepartmentAccessError, type DepartmentScope } from "@/lib/authz";
import { and, eq, inArray, or, sql, type SQL } from "drizzle-orm";

type FlowRecordRef = {
  type: string | null | undefined;
  department: string | null | undefined;
};

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

/**
 * 严格部门归属流程：仅流程自身 department 匹配当前部门（管理员放行）。
 * 与 visibleFlowPredicate 的宽松版不同：全局流程（department IS NULL）不会因本部门已有报名而放行。
 * 邮件批次 / 投递等读写路径使用此口径，与 assertFlowEditable 的写权限判定保持一致。
 */
export const strictlyVisibleFlowPredicate = (
  scope: DepartmentScope,
): SQL<unknown> | undefined => {
  if (scope.kind === "all") return undefined;
  if (scope.kind === "none") return sql`false`;
  return eq(flow.department, scope.department);
};

/**
 * 以「解析后的流程 id」做严格部门隔离：
 * 用于邮件投递（coalesce(投递流程, 批次流程)）等流程归属需回退解析的场景。
 * 未归属部门（department IS NULL）与已删除流程对部门账号不可见，管理员不过滤。
 */
export const scopedResolvedFlowIdCondition = (
  scope: DepartmentScope,
  resolvedFlowId: SQL<number>,
): SQL<unknown> | undefined => {
  if (scope.kind === "all") return undefined;
  return inArray(
    resolvedFlowId,
    db
      .select({ id: flow.id })
      .from(flow)
      .where(and(eq(flow.isDeleted, false), strictlyVisibleFlowPredicate(scope))),
  );
};

/** 流程本身的编辑权（标题/步骤/题目/发布）：只有流程归属部门或管理员 */
export const canEditFlow = (
  scope: DepartmentScope,
  department: string | null | undefined,
) => canAccessDepartment(scope, department);

/**
 * 单条流程是否在当前账号可见范围内（与 visibleFlowPredicate 同一口径）。
 * 用于只读查看详情：进不去编辑，但本部门相关（或全局且有本部门报名）的流程要能打开看。
 */
export const isFlowVisibleToScope = async (
  scope: DepartmentScope,
  flowId: number,
): Promise<boolean> => {
  if (scope.kind === "all") return true;
  /* 没有部门归属 == 什么都看不到，不必再查库 */
  if (scope.kind === "none") return false;
  const predicate = visibleFlowPredicate(scope);
  if (!predicate) return false;
  const [row] = await db
    .select({ id: flow.id })
    .from(flow)
    .where(and(eq(flow.id, flowId), predicate))
    .limit(1);
  return Boolean(row);
};

export const assertFlowEditable = (
  scope: DepartmentScope,
  department: string | null | undefined,
  message = "无权修改其他部门的流程",
) => {
  if (!canEditFlow(scope, department)) {
    throw new DepartmentAccessError(message);
  }
};

/** 流程编辑权（按流程记录）：归属部门匹配当前 scope（管理员放行） */
export const canEditFlowRecord = (
  scope: DepartmentScope,
  flowRef: FlowRecordRef,
) => canEditFlow(scope, flowRef.department);

export const assertFlowEditableRecord = (
  scope: DepartmentScope,
  flowRef: FlowRecordRef,
  message = "无权修改其他部门的流程",
) => {
  if (!canEditFlowRecord(scope, flowRef)) {
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

/** 候选人访问权：报名归属部门匹配当前 scope（管理员放行） */
export const canAccessUserFlow = (
  scope: DepartmentScope,
  row: { department: string | null | undefined } & FlowRecordRef,
) => canAccessDepartment(scope, row.department);

export const assertUserFlowAccess = (
  scope: DepartmentScope,
  row: { department: string | null | undefined } & FlowRecordRef,
  message = "无权操作其他部门的候选人",
) => {
  if (!canAccessUserFlow(scope, row)) {
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
