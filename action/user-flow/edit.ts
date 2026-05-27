'use server';

import { db } from '@/db/drizzle';
import { userFlow } from '@/db/schema';
// TODO: for some status, send email to user
// import eventManager from '@/event';
import { verifyRole } from '@/lib/dal';
import { logServerError } from '@/lib/server-error-log';
import { and, eq, inArray, notInArray, sql } from 'drizzle-orm';
import { syncUserRoleFromAcceptedFlows } from './roleTransition';

const assertUserFlowCanBeManuallyAdjusted = async (userFlowId: number) => {
  const [record] = await db
    .select({ status: userFlow.status })
    .from(userFlow)
    .where(eq(userFlow.id, userFlowId))
    .limit(1);

  if (!record) {
    throw new Error("User flow not found");
  }

  if (record.status === "accepted" || record.status === "rejected") {
    throw new Error("Final email status cannot be adjusted here");
  }
};

export const forward = async (
  userFlowId: number,
) => {
  let session: Awaited<ReturnType<typeof verifyRole>> | null = null;

  try {
    session = await verifyRole(3);
    await assertUserFlowCanBeManuallyAdjusted(userFlowId);
    await db.update(userFlow).set({currentStepOrder: sql`${userFlow.currentStepOrder} + 1`}).where(eq(userFlow.id, userFlowId));
  } catch (error) {
    logServerError("user-flow:forward", error, {
      path: "/dashboard/manage",
      userId: session?.uid ?? null,
      role: session?.role ?? null,
      action: "forward-user-flow",
      userFlowId,
    });
    throw error;
  }
};

export const finish = async (
  userFlowId: number,
) => {
  let session: Awaited<ReturnType<typeof verifyRole>> | null = null;

  try {
    session = await verifyRole(3);
    await assertUserFlowCanBeManuallyAdjusted(userFlowId);

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
  } catch (error) {
    logServerError("user-flow:finish", error, {
      path: "/dashboard/manage",
      userId: session?.uid ?? null,
      role: session?.role ?? null,
      action: "finish-user-flow",
      userFlowId,
    });
    throw error;
  }
};

export const reject = async (
  userFlowId: number,
) => {
  let session: Awaited<ReturnType<typeof verifyRole>> | null = null;

  try {
    session = await verifyRole(3);
    await assertUserFlowCanBeManuallyAdjusted(userFlowId);
    const [record] = await db
      .select({ fkUserId: userFlow.fkUserId })
      .from(userFlow)
      .where(eq(userFlow.id, userFlowId))
      .limit(1);
    await db.update(userFlow).set({status: 'rejected'}).where(eq(userFlow.id, userFlowId));
    if (record) {
      await syncUserRoleFromAcceptedFlows(record.fkUserId);
    }
  } catch (error) {
    logServerError("user-flow:reject", error, {
      path: "/dashboard/manage",
      userId: session?.uid ?? null,
      role: session?.role ?? null,
      action: "reject-user-flow",
      userFlowId,
    });
    throw error;
  }
};

//   userFlowId: number,
//   currentStepOrder: number,

export const reopen = async (
  userFlowId: number,
) => {
  let session: Awaited<ReturnType<typeof verifyRole>> | null = null;

  try {
    session = await verifyRole(3);
    await assertUserFlowCanBeManuallyAdjusted(userFlowId);
    await db.update(userFlow).set({status: 'ongoing'}).where(eq(userFlow.id, userFlowId));
  } catch (error) {
    logServerError("user-flow:reopen", error, {
      path: "/dashboard/manage",
      userId: session?.uid ?? null,
      role: session?.role ?? null,
      action: "reopen-user-flow",
      userFlowId,
    });
    throw error;
  }
};


export const backward = async (
  userFlowId: number,
) => {
  let session: Awaited<ReturnType<typeof verifyRole>> | null = null;

  try {
    session = await verifyRole(3);
    await assertUserFlowCanBeManuallyAdjusted(userFlowId);
    await db.update(userFlow).set({currentStepOrder: sql`${userFlow.currentStepOrder} - 1`}).where(eq(userFlow.id, userFlowId));
  } catch (error) {
    logServerError("user-flow:backward", error, {
      path: "/dashboard/manage",
      userId: session?.uid ?? null,
      role: session?.role ?? null,
      action: "backward-user-flow",
      userFlowId,
    });
    throw error;
  }
};

export const batchUpdate = async (
  flowId: number,
  currentStepOrder: number,
) => {
  let session: Awaited<ReturnType<typeof verifyRole>> | null = null;

  try {
    session = await verifyRole(3);
    await db.update(userFlow).set({currentStepOrder: currentStepOrder}).where(eq(userFlow.fkFlowId, flowId));
  } catch (error) {
    logServerError("user-flow:batchUpdate", error, {
      path: "/dashboard/manage",
      userId: session?.uid ?? null,
      role: session?.role ?? null,
      action: "batch-update-user-flow-step",
      flowId,
      metadata: { currentStepOrder },
    });
    throw error;
  }
};

export const batchEndByUid = async (
  flowId: number,
  currentStepOrder: number,
  statusStr: 'rejected' | 'accepted',
  uids: number[],
) => {
  let session: Awaited<ReturnType<typeof verifyRole>> | null = null;

  try {
    session = await verifyRole(3);
    await db.update(userFlow).set({status: statusStr, currentStepOrder: currentStepOrder}).where(and(eq(userFlow.fkFlowId, flowId), inArray(userFlow.fkUserId, uids)));
    await Promise.all(uids.map((uid) => syncUserRoleFromAcceptedFlows(uid)));
  } catch (error) {
    logServerError("user-flow:batchEndByUid", error, {
      path: "/dashboard/review",
      userId: session?.uid ?? null,
      role: session?.role ?? null,
      action: "batch-end-user-flow",
      flowId,
      metadata: { currentStepOrder, status: statusStr, targetUserIds: uids },
    });
    throw error;
  }
};

export const batchSetOutcomeByUid = async (
  flowId: number,
  currentStepOrder: number,
  statusStr: 'passed' | 'failed',
  uids: number[],
) => {
  let session: Awaited<ReturnType<typeof verifyRole>> | null = null;

  try {
    session = await verifyRole(3);
    if (uids.length === 0) return;

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
  } catch (error) {
    logServerError("user-flow:batchSetOutcomeByUid", error, {
      path: "/dashboard/review",
      userId: session?.uid ?? null,
      role: session?.role ?? null,
      action: "batch-set-user-flow-outcome",
      flowId,
      metadata: { currentStepOrder, status: statusStr, targetUserIds: uids },
    });
    throw error;
  }
};
