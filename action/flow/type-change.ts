import "server-only";

import { db } from "@/db/drizzle";
import { flow, normalizeDepartmentKey, userFlow } from "@/db/schema";
import { OFFICE_INTERVIEW_FLOW_TYPE } from "@/const/flow";
import { eq } from "drizzle-orm";
import type { DepartmentScope } from "@/lib/authz";

export type FlowTypeValue = typeof flow.$inferInsert["type"];

export type FlowTypeChangeInput = {
  flowId: number;
  scope: DepartmentScope;
  /* 库中当前类型/归属部门 */
  currentType: FlowTypeValue;
  currentDepartment: string | null | undefined;
  /* 本次提交期望的类型（未提交时为 undefined） */
  nextType?: FlowTypeValue | null;
  /* 本次提交后的归属部门（已按管理员/部长规则解析，部长即原部门） */
  nextDepartment: string | null;
};

/**
 * 流程类型/归属变更的共享校验（updateFlow 与 saveFlowWorkspace 共用）：
 * - 类型与归属都没变：返回 null；
 * - 类型变化：仅管理员可改，且流程已有报名记录时禁止（报名数据按类型解释，改类型会让历史数据错位）；
 * - 归属变化：同样仅管理员可改，且已有报名记录时禁止——12 种语义类型里有多个组合
 *   （例如办公类四个部门）type 相同、只有部门不同，报名记录固化的是旧归属部门，
 *   直接改归属会让老候选人在两边都看不见；
 * - 目标类型为办公类部门面试招新时，归属部门不能为空。
 * 返回需要并入 patch 的字段（type），无变化时为 null。
 */
export const resolveFlowTypeChange = async ({
  flowId,
  scope,
  currentType,
  currentDepartment,
  nextType,
  nextDepartment,
}: FlowTypeChangeInput) => {
  const targetType = nextType ?? currentType;

  /* 办公类流程按部门隔离：无论是否换类型，最终类型是办公类就必须有归属部门 */
  if (targetType === OFFICE_INTERVIEW_FLOW_TYPE && !nextDepartment) {
    throw new Error("办公类部门面试招新必须归属一个办公部门");
  }

  const typeChanged = targetType !== currentType;
  const departmentChanged =
    normalizeDepartmentKey(nextDepartment) !==
    normalizeDepartmentKey(currentDepartment);
  if (!typeChanged && !departmentChanged) return null;

  if (scope.kind !== "all") {
    throw new Error(
      typeChanged ? "只有管理员可以修改流程类型" : "只有管理员可以修改流程归属部门",
    );
  }

  const [registered] = await db
    .select({ id: userFlow.id })
    .from(userFlow)
    .where(eq(userFlow.fkFlowId, flowId))
    .limit(1);
  if (registered) {
    throw new Error(
      typeChanged
        ? "已有报名记录的流程不能修改类型"
        : "已有报名记录的流程不能修改归属部门",
    );
  }

  return typeChanged ? { type: targetType } : null;
};
