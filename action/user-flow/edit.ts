'use server';

import { db } from '@/db/drizzle';
import { flow, flowStep, userFlow } from '@/db/schema';
import { type DepartmentScope, verifyManager } from '@/lib/authz';
import type { FlowScopedSession } from '@/action/flow/department-utils';
import { assertFlowEditable, assertUserFlowInScope } from '@/lib/flow-access';
import { logServerError } from '@/lib/server-error-log';
import { writeOperationAudit } from '@/lib/operation-audit';
import { assertFlowResultsEditable } from '@/lib/flow-result-publication-guard';
import { and, desc, eq, inArray } from 'drizzle-orm';

async function findStepIdByOrder(
  flowId: number,
  order: number,
): Promise<number | null> {
  const [step] = await db
    .select({ id: flowStep.id })
    .from(flowStep)
    .where(and(eq(flowStep.fkFlowId, flowId), eq(flowStep.order, order)))
    .limit(1);
  return step?.id ?? null;
}

/**
 * 流程的最终步骤：终态（passed / failed）必须落在它上面。
 *
 * 卡片把「当前步骤」和步骤圆点画在同一行（`components/userFlow/flowCard.tsx`）：
 * 终态行若停在中间步骤，就会出现「已通过考核 / 当前步骤：批卷 / 第三步已通过」这种自相矛盾的展示
 * （未通过时则是流程已结束却还挂着一个「未开始」的步骤）。
 *
 * 笔试流程的判定结果是在「批卷」页录入的，但结果属于最后一步「录取确认」（按分数线筛选并确认
 * 最终通过名单）——与 `evaluation.ts` 的 `findEvaluationStepIdInTx`、办公类面试的 `resultStepId`
 * 同一约定：终态一律写在流程最后一步。
 */
async function findFinalStepId(flowId: number): Promise<number | null> {
  const [byType] = await db
    .select({ id: flowStep.id })
    .from(flowStep)
    .where(and(eq(flowStep.fkFlowId, flowId), eq(flowStep.type, 'finished')))
    .orderBy(desc(flowStep.order), desc(flowStep.id))
    .limit(1);
  if (byType) return byType.id;

  /* 自定义流程可能没有 finished 步骤：退回到 order 最大的那一步 */
  const [last] = await db
    .select({ id: flowStep.id })
    .from(flowStep)
    .where(eq(flowStep.fkFlowId, flowId))
    .orderBy(desc(flowStep.order), desc(flowStep.id))
    .limit(1);
  return last?.id ?? null;
}

const TERMINAL_STATUSES = ['passed', 'failed', 'withdrawn'] as const;

const assertDirectOutcomeAllowed = async (userFlowId: number) => {
  const [record] = await db
    .select({ flowType: flow.type })
    .from(userFlow)
    .innerJoin(flow, eq(userFlow.fkFlowId, flow.id))
    .where(eq(userFlow.id, userFlowId))
    .limit(1);

  if (!record) throw new Error("User flow not found");
  if (record.flowType !== 'recruitment') {
    throw new Error("非笔试流程必须提交面评并由管理员审批后才能结束");
  }
};

const assertBatchDirectOutcomeAllowed = async (flowId: number) => {
  const [record] = await db
    .select({ type: flow.type })
    .from(flow)
    .where(eq(flow.id, flowId))
    .limit(1);

  if (!record) throw new Error("Flow not found");
  if (record.type !== 'recruitment') {
    throw new Error("非笔试流程必须通过面评审批决定结果");
  }
};

const assertUserFlowCanBeManuallyAdjusted = async (userFlowId: number) => {
  const [record] = await db
    .select({ progressStatus: userFlow.progressStatus })
    .from(userFlow)
    .where(eq(userFlow.id, userFlowId))
    .limit(1);

  if (!record) throw new Error("User flow not found");

  if (record.progressStatus && TERMINAL_STATUSES.includes(record.progressStatus as typeof TERMINAL_STATUSES[number])) {
    throw new Error("Final outcome cannot be adjusted here");
  }
};

/** 批量操作按流程归属收敛：流程不属本部门时整批拒绝，返回流程归属供审计落库 */
const assertFlowInScope = async (scope: DepartmentScope, flowId: number) => {
  const [record] = await db
    .select({ department: flow.department })
    .from(flow)
    .where(eq(flow.id, flowId))
    .limit(1);

  if (!record) throw new Error("Flow not found");
  assertFlowEditable(scope, record.department);
  return record.department;
};

export const forward = async (userFlowId: number) => {
  let session: FlowScopedSession | null = null;
  try {
    session = await verifyManager();
    await assertUserFlowCanBeManuallyAdjusted(userFlowId);
    const [uf] = await db
      .select({ flowId: userFlow.fkFlowId, currentOrder: flowStep.order, department: userFlow.department })
      .from(userFlow)
      .innerJoin(flowStep, eq(userFlow.fkCurrentStepId, flowStep.id))
      .where(eq(userFlow.id, userFlowId))
      .limit(1);
    if (!uf) throw new Error("User flow not found");
    assertUserFlowInScope(session.scope, uf.department);
    const nextStepId = await findStepIdByOrder(uf.flowId, uf.currentOrder + 1);
    await db.update(userFlow).set({ fkCurrentStepId: nextStepId, updatedAt: new Date() }).where(eq(userFlow.id, userFlowId));
    await writeOperationAudit({ actorId: session.uid, actorRole: session.realRole, action: 'user_flow.forward', resourceType: 'user_flow', resourceId: userFlowId, department: uf.department });
  } catch (error) {
    logServerError("user-flow:forward", error, { path: "/dashboard/manage", userId: session?.uid ?? null, role: session?.role ?? null, action: "forward-user-flow", userFlowId });
    throw error;
  }
};

export const finish = async (userFlowId: number) => {
  let session: FlowScopedSession | null = null;
  try {
    session = await verifyManager();
    const [flowRecord] = await db.select({ flowId: userFlow.fkFlowId, department: userFlow.department }).from(userFlow).where(eq(userFlow.id, userFlowId)).limit(1);
    if (!flowRecord) throw new Error("User flow not found");
    assertUserFlowInScope(session.scope, flowRecord.department);
    await assertFlowResultsEditable(flowRecord.flowId);
    await assertUserFlowCanBeManuallyAdjusted(userFlowId);
    await assertDirectOutcomeAllowed(userFlowId);
    const record = await db.select({ userFlowId: userFlow.id, fkUserId: userFlow.fkUserId }).from(userFlow).where(eq(userFlow.id, userFlowId)).limit(1);
    if (!record[0]) throw new Error("User flow not found");
    const { fkUserId } = record[0];
    /* 终态写在流程最后一步：卡片按「当前步骤」画圆点，停在中间步骤会和「已通过考核」互相打架 */
    const finalStepId = await findFinalStepId(flowRecord.flowId);
    await db.update(userFlow).set({ progressStatus: "passed", fkCurrentStepId: finalStepId, updatedAt: new Date() }).where(eq(userFlow.id, userFlowId));
    await writeOperationAudit({ actorId: session.uid, actorRole: session.realRole, action: 'user_flow.finish', resourceType: 'user_flow', resourceId: userFlowId, department: flowRecord.department, metadata: { userId: fkUserId } });
  } catch (error) {
    logServerError("user-flow:finish", error, { path: "/dashboard/manage", userId: session?.uid ?? null, role: session?.role ?? null, action: "finish-user-flow", userFlowId });
    throw error;
  }
};

export const reject = async (userFlowId: number) => {
  let session: FlowScopedSession | null = null;
  try {
    session = await verifyManager();
    const [flowRecord] = await db.select({ flowId: userFlow.fkFlowId, department: userFlow.department }).from(userFlow).where(eq(userFlow.id, userFlowId)).limit(1);
    if (!flowRecord) throw new Error("User flow not found");
    assertUserFlowInScope(session.scope, flowRecord.department);
    await assertFlowResultsEditable(flowRecord.flowId);
    await assertUserFlowCanBeManuallyAdjusted(userFlowId);
    await assertDirectOutcomeAllowed(userFlowId);
    const [record] = await db.select({ fkUserId: userFlow.fkUserId }).from(userFlow).where(eq(userFlow.id, userFlowId)).limit(1);
    /* 终态写在流程最后一步：卡片按「当前步骤」画圆点，停在中间步骤会和「未通过考核」互相打架 */
    const finalStepId = await findFinalStepId(flowRecord.flowId);
    await db.update(userFlow).set({ progressStatus: "failed", fkCurrentStepId: finalStepId, updatedAt: new Date() }).where(eq(userFlow.id, userFlowId));
    await writeOperationAudit({ actorId: session.uid, actorRole: session.realRole, action: 'user_flow.reject', resourceType: 'user_flow', resourceId: userFlowId, department: flowRecord.department, metadata: { userId: record?.fkUserId ?? null } });
  } catch (error) {
    logServerError("user-flow:reject", error, { path: "/dashboard/manage", userId: session?.uid ?? null, role: session?.role ?? null, action: "reject-user-flow", userFlowId });
    throw error;
  }
};

export const reopen = async (userFlowId: number) => {
  let session: FlowScopedSession | null = null;
  try {
    session = await verifyManager();
    const [flowRecord] = await db.select({ flowId: userFlow.fkFlowId, department: userFlow.department }).from(userFlow).where(eq(userFlow.id, userFlowId)).limit(1);
    if (!flowRecord) throw new Error("User flow not found");
    assertUserFlowInScope(session.scope, flowRecord.department);
    await assertFlowResultsEditable(flowRecord.flowId);
    await assertUserFlowCanBeManuallyAdjusted(userFlowId);
    await db.update(userFlow).set({ progressStatus: "ongoing", updatedAt: new Date() }).where(eq(userFlow.id, userFlowId));
    await writeOperationAudit({ actorId: session.uid, actorRole: session.realRole, action: 'user_flow.reopen', resourceType: 'user_flow', resourceId: userFlowId, department: flowRecord.department });
  } catch (error) {
    logServerError("user-flow:reopen", error, { path: "/dashboard/manage", userId: session?.uid ?? null, role: session?.role ?? null, action: "reopen-user-flow", userFlowId });
    throw error;
  }
};

export const backward = async (userFlowId: number) => {
  let session: FlowScopedSession | null = null;
  try {
    session = await verifyManager();
    const [flowRecord] = await db.select({ flowId: userFlow.fkFlowId, department: userFlow.department }).from(userFlow).where(eq(userFlow.id, userFlowId)).limit(1);
    if (!flowRecord) throw new Error("User flow not found");
    assertUserFlowInScope(session.scope, flowRecord.department);
    await assertFlowResultsEditable(flowRecord.flowId);
    await assertUserFlowCanBeManuallyAdjusted(userFlowId);
    const [uf] = await db.select({ flowId: userFlow.fkFlowId, currentOrder: flowStep.order }).from(userFlow).innerJoin(flowStep, eq(userFlow.fkCurrentStepId, flowStep.id)).where(eq(userFlow.id, userFlowId)).limit(1);
    if (!uf) throw new Error("User flow not found");
    const prevStepId = await findStepIdByOrder(uf.flowId, uf.currentOrder - 1);
    await db.update(userFlow).set({ fkCurrentStepId: prevStepId, updatedAt: new Date() }).where(eq(userFlow.id, userFlowId));
    await writeOperationAudit({ actorId: session.uid, actorRole: session.realRole, action: 'user_flow.backward', resourceType: 'user_flow', resourceId: userFlowId, department: flowRecord.department });
  } catch (error) {
    logServerError("user-flow:backward", error, { path: "/dashboard/manage", userId: session?.uid ?? null, role: session?.role ?? null, action: "backward-user-flow", userFlowId });
    throw error;
  }
};

export const batchUpdate = async (flowId: number, stepOrder: number) => {
  let session: FlowScopedSession | null = null;
  try {
    session = await verifyManager();
    const flowDepartment = await assertFlowInScope(session.scope, flowId);
    await assertFlowResultsEditable(flowId);
    const stepId = await findStepIdByOrder(flowId, stepOrder);
    await db.update(userFlow).set({ fkCurrentStepId: stepId, updatedAt: new Date() }).where(eq(userFlow.fkFlowId, flowId));
    await writeOperationAudit({ actorId: session.uid, actorRole: session.realRole, action: 'user_flow.batch_update_step', resourceType: 'flow', resourceId: flowId, department: flowDepartment, metadata: { stepOrder } });
  } catch (error) {
    logServerError("user-flow:batchUpdate", error, { path: "/dashboard/manage", userId: session?.uid ?? null, role: session?.role ?? null, action: "batch-update-user-flow-step", flowId, metadata: { stepOrder } });
    throw error;
  }
};

/**
 * 批量设置结果（笔试「成绩管理」页：设为通过 / 不通过 / 未参与）。
 *
 * `stepOrder` 是候选人**当前所处步骤**，只进审计（记录判定是在哪一步录入的）；
 * 结果本身按约定落在流程最后一步（`findFinalStepId`），否则卡片会把「当前步骤」画在中间步骤上，
 * 与终态标签自相矛盾。未参与（withdrawn）不动当前步骤：候选人停在离开的那一步。
 */
export const batchSetOutcomeByUid = async (
  flowId: number,
  stepOrder: number,
  statusStr: 'passed' | 'failed' | 'withdrawn',
  uids: number[],
) => {
  let session: FlowScopedSession | null = null;
  try {
    session = await verifyManager();
    if (uids.length === 0) return { updatedUserIds: [] };
    const flowDepartment = await assertFlowInScope(session.scope, flowId);
    await assertFlowResultsEditable(flowId);
    await assertBatchDirectOutcomeAllowed(flowId);
    const finalStepId =
      statusStr === 'withdrawn' ? null : await findFinalStepId(flowId);
    const updatedUserIds = await db.transaction(async (tx) => {
      const targetRows = await tx
        .select({ id: userFlow.id, userId: userFlow.fkUserId })
        .from(userFlow)
        .where(
          and(
            eq(userFlow.fkFlowId, flowId),
            inArray(userFlow.fkUserId, uids),
          ),
        )
        .for('update');

      if (targetRows.length === 0) return [];

      await tx
        .update(userFlow)
        .set({
          progressStatus: statusStr,
          ...(finalStepId === null ? {} : { fkCurrentStepId: finalStepId }),
          updatedAt: new Date(),
        })
        .where(inArray(userFlow.id, targetRows.map((row) => row.id)));

      return targetRows.map((row) => row.userId);
    });
    const updatedUserIdSet = new Set(updatedUserIds);
    await writeOperationAudit({
      actorId: session.uid,
      actorRole: session.realRole,
      action: 'user_flow.batch_set_outcome',
      resourceType: 'flow',
      resourceId: flowId,
      department: flowDepartment,
      metadata: {
        stepOrder,
        status: statusStr,
        updatedUserIds,
        skippedUserIds: uids.filter((userId) => !updatedUserIdSet.has(userId)),
      },
    });
    return { updatedUserIds };
  } catch (error) {
    logServerError("user-flow:batchSetOutcomeByUid", error, {
      path: "/dashboard/review",
      userId: session?.uid ?? null,
      role: session?.role ?? null,
      action: "batch-set-user-flow-outcome",
      flowId,
      metadata: { stepOrder, status: statusStr, targetUserIds: uids },
    });
    throw error;
  }
};
