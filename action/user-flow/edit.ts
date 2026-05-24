'use server';

import { db } from '@/db/drizzle';
import { flow, user, userFlow } from '@/db/schema';
// TODO: for some status, send email to user
// import eventManager from '@/event';
import { verifyRole, verifySession } from '@/lib/dal';
import { and, eq, inArray, sql } from 'drizzle-orm';

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
      flowType: flow.type,
      userRole: user.role,
    })
    .from(userFlow)
    .innerJoin(flow, eq(userFlow.fkFlowId, flow.id))
    .innerJoin(user, eq(userFlow.fkUserId, user.id))
    .where(eq(userFlow.id, userFlowId))
    .limit(1);

  if (!record[0]) {
    throw new Error("User flow not found");
  }

  const { fkUserId, flowType, userRole } = record[0];

  // Auto-promote role based on flow type
  let nextRole = userRole;
  if ((flowType === "recruitment" || flowType === "recruitment_exemption") && userRole === 0) {
    nextRole = 1; // 新同学 → 部员
  } else if (flowType === "soc" && userRole === 1) {
    nextRole = 2; // 部员 → 讲师
  }
  // woc: role stays 1 (部员), no change

  await db.transaction(async (tx) => {
    await tx
      .update(userFlow)
      .set({ status: "accepted" })
      .where(eq(userFlow.id, userFlowId));

    if (nextRole !== userRole) {
      await tx
        .update(user)
        .set({ role: nextRole, updatedAt: new Date() })
        .where(eq(user.id, fkUserId));
    }
  });
};

export const reject = async (
  userFlowId: number,
) => {
  await verifyRole(3);
  await db.update(userFlow).set({status: 'rejected'}).where(eq(userFlow.id, userFlowId));
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
};
