'use server';

import { db } from '@/db/drizzle';
import { userFlow } from '@/db/schema';
import { findPeopleUserByStudentId } from '@/lib/link/user-lookup';
import { and, eq } from 'drizzle-orm';

export const findUserFlowId = async (
  studentId: string,
  flowId: number,
) => {
  const userInfo = await findPeopleUserByStudentId(studentId);
  if (!userInfo) {
    return null;
  }

  const [result] = await db
    .select({ id: userFlow.id, progressStatus: userFlow.progressStatus })
    .from(userFlow)
    .where(and(eq(userFlow.fkUserId, userInfo.id), eq(userFlow.fkFlowId, flowId)));

  return result ?? null;
};
