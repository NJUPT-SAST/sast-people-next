'use server';

import { db } from '@/db/drizzle';
import { flow, flowStep, userFlow } from '@/db/schema';
import { verifyRole } from '@/lib/dal';
import { logServerError } from '@/lib/server-error-log';
import { writeOperationAudit } from '@/lib/operation-audit';
import { and, eq, inArray, notInArray } from 'drizzle-orm';
import { syncUserRoleFromAcceptedFlows } from './roleTransition';

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

const TERMINAL_STATUSES = ['passed', 'failed'] as const;

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

export const forward = async (userFlowId: number) => {
  let session: Awaited<ReturnType<typeof verifyRole>> | null = null;
  try {
    session = await verifyRole(3);
    await assertUserFlowCanBeManuallyAdjusted(userFlowId);
    const [uf] = await db
      .select({ flowId: userFlow.fkFlowId, currentOrder: flowStep.order })
      .from(userFlow)
      .innerJoin(flowStep, eq(userFlow.fkCurrentStepId, flowStep.id))
      .where(eq(userFlow.id, userFlowId))
      .limit(1);
    if (!uf) throw new Error("User flow not found");
    const nextStepId = await findStepIdByOrder(uf.flowId, uf.currentOrder + 1);
    await db.update(userFlow).set({ fkCurrentStepId: nextStepId, updatedAt: new Date() }).where(eq(userFlow.id, userFlowId));
    await writeOperationAudit({ actorId: session.uid, action: 'user_flow.forward', resourceType: 'user_flow', resourceId: userFlowId });
  } catch (error) {
    logServerError("user-flow:forward", error, { path: "/dashboard/manage", userId: session?.uid ?? null, role: session?.role ?? null, action: "forward-user-flow", userFlowId });
    throw error;
  }
};

export const finish = async (userFlowId: number) => {
  let session: Awaited<ReturnType<typeof verifyRole>> | null = null;
  try {
    session = await verifyRole(3);
    await assertUserFlowCanBeManuallyAdjusted(userFlowId);
    await assertDirectOutcomeAllowed(userFlowId);
    const record = await db.select({ userFlowId: userFlow.id, fkUserId: userFlow.fkUserId }).from(userFlow).where(eq(userFlow.id, userFlowId)).limit(1);
    if (!record[0]) throw new Error("User flow not found");
    const { fkUserId } = record[0];
    await db.update(userFlow).set({ progressStatus: "passed", updatedAt: new Date() }).where(eq(userFlow.id, userFlowId));
    await syncUserRoleFromAcceptedFlows(fkUserId);
    await writeOperationAudit({ actorId: session.uid, action: 'user_flow.finish', resourceType: 'user_flow', resourceId: userFlowId, metadata: { userId: fkUserId } });
  } catch (error) {
    logServerError("user-flow:finish", error, { path: "/dashboard/manage", userId: session?.uid ?? null, role: session?.role ?? null, action: "finish-user-flow", userFlowId });
    throw error;
  }
};

export const reject = async (userFlowId: number) => {
  let session: Awaited<ReturnType<typeof verifyRole>> | null = null;
  try {
    session = await verifyRole(3);
    await assertUserFlowCanBeManuallyAdjusted(userFlowId);
    await assertDirectOutcomeAllowed(userFlowId);
    const [record] = await db.select({ fkUserId: userFlow.fkUserId }).from(userFlow).where(eq(userFlow.id, userFlowId)).limit(1);
    await db.update(userFlow).set({ progressStatus: "failed", updatedAt: new Date() }).where(eq(userFlow.id, userFlowId));
    if (record) await syncUserRoleFromAcceptedFlows(record.fkUserId);
    await writeOperationAudit({ actorId: session.uid, action: 'user_flow.reject', resourceType: 'user_flow', resourceId: userFlowId, metadata: { userId: record?.fkUserId ?? null } });
  } catch (error) {
    logServerError("user-flow:reject", error, { path: "/dashboard/manage", userId: session?.uid ?? null, role: session?.role ?? null, action: "reject-user-flow", userFlowId });
    throw error;
  }
};

export const reopen = async (userFlowId: number) => {
  let session: Awaited<ReturnType<typeof verifyRole>> | null = null;
  try {
    session = await verifyRole(3);
    await assertUserFlowCanBeManuallyAdjusted(userFlowId);
    await db.update(userFlow).set({ progressStatus: "ongoing", updatedAt: new Date() }).where(eq(userFlow.id, userFlowId));
    await writeOperationAudit({ actorId: session.uid, action: 'user_flow.reopen', resourceType: 'user_flow', resourceId: userFlowId });
  } catch (error) {
    logServerError("user-flow:reopen", error, { path: "/dashboard/manage", userId: session?.uid ?? null, role: session?.role ?? null, action: "reopen-user-flow", userFlowId });
    throw error;
  }
};

export const backward = async (userFlowId: number) => {
  let session: Awaited<ReturnType<typeof verifyRole>> | null = null;
  try {
    session = await verifyRole(3);
    await assertUserFlowCanBeManuallyAdjusted(userFlowId);
    const [uf] = await db.select({ flowId: userFlow.fkFlowId, currentOrder: flowStep.order }).from(userFlow).innerJoin(flowStep, eq(userFlow.fkCurrentStepId, flowStep.id)).where(eq(userFlow.id, userFlowId)).limit(1);
    if (!uf) throw new Error("User flow not found");
    const prevStepId = await findStepIdByOrder(uf.flowId, uf.currentOrder - 1);
    await db.update(userFlow).set({ fkCurrentStepId: prevStepId, updatedAt: new Date() }).where(eq(userFlow.id, userFlowId));
    await writeOperationAudit({ actorId: session.uid, action: 'user_flow.backward', resourceType: 'user_flow', resourceId: userFlowId });
  } catch (error) {
    logServerError("user-flow:backward", error, { path: "/dashboard/manage", userId: session?.uid ?? null, role: session?.role ?? null, action: "backward-user-flow", userFlowId });
    throw error;
  }
};

export const batchUpdate = async (flowId: number, stepOrder: number) => {
  let session: Awaited<ReturnType<typeof verifyRole>> | null = null;
  try {
    session = await verifyRole(3);
    const stepId = await findStepIdByOrder(flowId, stepOrder);
    await db.update(userFlow).set({ fkCurrentStepId: stepId, updatedAt: new Date() }).where(eq(userFlow.fkFlowId, flowId));
    await writeOperationAudit({ actorId: session.uid, action: 'user_flow.batch_update_step', resourceType: 'flow', resourceId: flowId, metadata: { stepOrder } });
  } catch (error) {
    logServerError("user-flow:batchUpdate", error, { path: "/dashboard/manage", userId: session?.uid ?? null, role: session?.role ?? null, action: "batch-update-user-flow-step", flowId, metadata: { stepOrder } });
    throw error;
  }
};

export const batchEndByUid = async (
  flowId: number,
  stepOrder: number,
  statusStr: 'rejected' | 'accepted',
  uids: number[],
) => {
  let session: Awaited<ReturnType<typeof verifyRole>> | null = null;
  try {
    session = await verifyRole(3);
    await assertBatchDirectOutcomeAllowed(flowId);
    const stepId = await findStepIdByOrder(flowId, stepOrder);
    const progressStatus = statusStr === 'accepted' ? 'passed' : 'failed';
    await db.update(userFlow).set({ progressStatus, fkCurrentStepId: stepId, updatedAt: new Date() }).where(and(eq(userFlow.fkFlowId, flowId), inArray(userFlow.fkUserId, uids)));
    await Promise.all(uids.map((uid) => syncUserRoleFromAcceptedFlows(uid)));
    await writeOperationAudit({ actorId: session.uid, action: 'user_flow.batch_end', resourceType: 'flow', resourceId: flowId, metadata: { stepOrder, status: statusStr, targetUserIds: uids } });
  } catch (error) {
    logServerError("user-flow:batchEndByUid", error, { path: "/dashboard/review", userId: session?.uid ?? null, role: session?.role ?? null, action: "batch-end-user-flow", flowId, metadata: { stepOrder, status: statusStr, targetUserIds: uids } });
    throw error;
  }
};

export const batchSetOutcomeByUid = async (
  flowId: number,
  stepOrder: number,
  statusStr: 'passed' | 'failed',
  uids: number[],
) => {
  let session: Awaited<ReturnType<typeof verifyRole>> | null = null;
  try {
    session = await verifyRole(3);
    if (uids.length === 0) return;
    await assertBatchDirectOutcomeAllowed(flowId);
    const stepId = await findStepIdByOrder(flowId, stepOrder);
    await db.update(userFlow).set({ progressStatus: statusStr, fkCurrentStepId: stepId, updatedAt: new Date() }).where(and(eq(userFlow.fkFlowId, flowId), inArray(userFlow.fkUserId, uids), notInArray(userFlow.progressStatus, ['passed', 'failed'])));
    await writeOperationAudit({ actorId: session.uid, action: 'user_flow.batch_set_outcome', resourceType: 'flow', resourceId: flowId, metadata: { stepOrder, status: statusStr, targetUserIds: uids } });
  } catch (error) {
    logServerError("user-flow:batchSetOutcomeByUid", error, { path: "/dashboard/review", userId: session?.uid ?? null, role: session?.role ?? null, action: "batch-set-user-flow-outcome", flowId, metadata: { stepOrder, status: statusStr, targetUserIds: uids } });
    throw error;
  }
};
