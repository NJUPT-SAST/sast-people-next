import "server-only";

import { flow, userFlow } from "@/db/schema";
import { canAccessDepartment, DepartmentAccessError, type DepartmentScope } from "@/lib/authz";
import { departmentCategory } from "@/const/department";
import { OFFICE_INTERVIEW_FLOW_TYPE } from "@/const/flow";
import { and, eq, isNull, or, sql, type SQL } from "drizzle-orm";

type FlowRecordRef = {
  type: string | null | undefined;
  department: string | null | undefined;
};

/**
 * 办公类部门面试招新是「所有办公部门共用的一条流程」（department 为空）：
 * 办公类部门的账号可以共同编辑流程、评审候选人、发布结果与发送邮件。
 */
export const isSharedOfficeFlow = (flowRef: FlowRecordRef) =>
  flowRef.type === OFFICE_INTERVIEW_FLOW_TYPE && !flowRef.department;

export const canManageSharedOfficeFlow = (scope: DepartmentScope) =>
  scope.kind === "all" ||
  (scope.kind === "department" && departmentCategory(scope.department) === "office");

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

  const clauses: SQL<unknown>[] = [
    eq(flow.department, scope.department),
    sql`(
      ${flow.department} IS NULL
      AND EXISTS (
        SELECT 1 FROM ${userFlow}
        WHERE ${userFlow.fkFlowId} = ${flow.id}
          AND ${userFlow.department} = ${scope.department}
      )
    )`,
  ];

  /* 办公类共享流程：办公类部门的账号都能看到（它们共同管理这一条流程） */
  if (departmentCategory(scope.department) === "office") {
    clauses.push(
      and(
        eq(flow.type, OFFICE_INTERVIEW_FLOW_TYPE),
        isNull(flow.department),
      ) as SQL<unknown>,
    );
  }

  return or(...clauses);
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

/** 流程编辑权（含办公类共享流程的共同管理） */
export const canEditFlowRecord = (
  scope: DepartmentScope,
  flowRef: FlowRecordRef,
) =>
  canEditFlow(scope, flowRef.department) ||
  (isSharedOfficeFlow(flowRef) && canManageSharedOfficeFlow(scope));

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

/** 候选人访问权：报名归属部门匹配，或该流程为办公类共享流程且账号属于办公类部门 */
export const canAccessUserFlow = (
  scope: DepartmentScope,
  row: { department: string | null | undefined } & FlowRecordRef,
) =>
  canAccessDepartment(scope, row.department) ||
  (isSharedOfficeFlow(row) && canManageSharedOfficeFlow(scope));

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
