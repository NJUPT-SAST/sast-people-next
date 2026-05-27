"use server";
import { db } from '@/db/drizzle';
import { userPoint } from '@/db/schema';
import { logServerError } from '@/lib/server-error-log';
import { desc, eq, InferSelectModel } from "drizzle-orm";

export const useUserPointList = async (userFlowId: number): Promise<Array<InferSelectModel<typeof userPoint>>> => {
  try {
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
      userFlowId,
    });
    throw error;
  }
};
