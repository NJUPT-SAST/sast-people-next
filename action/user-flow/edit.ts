'use server';

import { db } from '@/db/drizzle';
import { userFlow } from '@/db/schema';
// TODO: for some status, send email to user
// import eventManager from '@/event';
import { verifyRole, verifySession } from '@/lib/dal';
import { and, eq, inArray, notInArray, sql } from 'drizzle-orm';
import { syncUserRoleFromAcceptedFlows } from './roleTransition';

export const forward = async (
  userFlowId: number,
) => {
  await verifyRole(3);
  await db.update(userFlow).set({currentStepOrder: sql`${userFlow.currentStepOrder} + 1`}).where(eq(userFlow.id, userFlowId));
};

export const finish = async (
  userFlowId: number,
) => {
  await verifyRole(3);

  const record = await db
    .select({
      userFlowId: userFlow.id,
      fkUserId: userFlow.fkUserId,
    })
    .from(userFlow)
    .where(eq(userFlow.id, userFlowId))
    .limit(1);

  if (!record[0]) {
    throw new Error("User flow not found");
  }

  const { fkUserId } = record[0];

  await db
    .update(userFlow)
    .set({ status: "accepted" })
    .where(eq(userFlow.id, userFlowId));

  await syncUserRoleFromAcceptedFlows(fkUserId);
};

export const reject = async (
  userFlowId: number,
) => {
  await verifyRole(3);
  const [record] = await db
    .select({ fkUserId: userFlow.fkUserId })
    .from(userFlow)
    .where(eq(userFlow.id, userFlowId))
    .limit(1);
  await db.update(userFlow).set({status: 'rejected'}).where(eq(userFlow.id, userFlowId));
  if (record) {
    await syncUserRoleFromAcceptedFlows(record.fkUserId);
  }
};

//   userFlowId: number,
//   currentStepOrder: number,

export const reopen = async (
  userFlowId: number,
) => {
  await verifyRole(3);
  await db.update(userFlow).set({status: 'ongoing'}).where(eq(userFlow.id, userFlowId));
};


export const backward = async (
  userFlowId: number,
) => {
  await verifyRole(3);
  await db.update(userFlow).set({currentStepOrder: sql`${userFlow.currentStepOrder} - 1`}).where(eq(userFlow.id, userFlowId));
};

export const batchUpdate = async (
  flowId: number,
  currentStepOrder: number,
) => {
  await verifyRole(3);
  const user = await verifySession();
  console.log(user.name, "batchUpdate", flowId, currentStepOrder);
  await db.update(userFlow).set({currentStepOrder: currentStepOrder}).where(eq(userFlow.fkFlowId, flowId));
};

export const batchEndByUid = async (
  flowId: number,
  currentStepOrder: number,
  statusStr: 'rejected' | 'accepted',
  uids: number[],
) => {
  await verifyRole(3);
  await db.update(userFlow).set({status: statusStr, currentStepOrder: currentStepOrder}).where(and(eq(userFlow.fkFlowId, flowId), inArray(userFlow.fkUserId, uids)));
  await Promise.all(uids.map((uid) => syncUserRoleFromAcceptedFlows(uid)));
};

export const batchSetOutcomeByUid = async (
  flowId: number,
  currentStepOrder: number,
  statusStr: 'passed' | 'failed',
  uids: number[],
) => {
  await verifyRole(3);
  if (uids.length === 0) return;

  const [lockedRecord] = await db
    .select({ id: userFlow.id })
    .from(userFlow)
    .where(
      and(
        eq(userFlow.fkFlowId, flowId),
        inArray(userFlow.status, ['accepted', 'rejected']),
      ),
    )
    .limit(1);

  if (lockedRecord) {
    throw new Error('结果邮件已发送，名单已锁定');
  }

  await db
    .update(userFlow)
    .set({ status: statusStr, currentStepOrder })
    .where(
      and(
        eq(userFlow.fkFlowId, flowId),
        inArray(userFlow.fkUserId, uids),
        notInArray(userFlow.status, ['accepted', 'rejected']),
      ),
    );
};
