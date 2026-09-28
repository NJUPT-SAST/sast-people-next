"use server";
import { db } from '@/db/drizzle';
import { userFlow, userPoint } from '@/db/schema';
import { verifyScopedRole } from '@/lib/authz';
import { assertUserFlowInScope } from '@/lib/flow-access';
import { logServerError } from '@/lib/server-error-log';
import { desc, eq, InferSelectModel } from "drizzle-orm";

export const useUserPointList = async (userFlowId: number): Promise<Array<InferSelectModel<typeof userPoint>>> => {
  const session = await verifyScopedRole(2);
  try {
    // 只能读取本部门可见候选人的评分记录
    const [target] = await db
      .select({ department: userFlow.department })
      .from(userFlow)
      .where(eq(userFlow.id, userFlowId))
      .limit(1);

    if (!target) {
      return [];
    }
    assertUserFlowInScope(session.scope, target.department);

    const userPoints = await db
      .select()
      .from(userPoint)
      .where(eq(userPoint.fkUserFlowId, userFlowId))
      .orderBy(desc(userPoint.fkProblemId));
    return userPoints;
  } catch (error) {
    logServerError('review:getUserPointList', error, {
      path: '/dashboard/review/marking',
      action: 'load-user-points',
      userId: session.uid,
      role: session.role,
      userFlowId,
    });
    throw error;
  }
};
