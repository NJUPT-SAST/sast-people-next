'use server';
import { db } from '@/db/drizzle';
import { userFlow } from '@/db/schema';
import { verifyRole } from '@/lib/dal';
import { findPeopleUserByStudentId } from '@/lib/link/user-lookup';
import { eq } from 'drizzle-orm';

export const useOngoingUserFlow = async (studentId: string) => {
  await verifyRole(3);

  const userInfo = await findPeopleUserByStudentId(studentId);
  if (!userInfo) {
    throw new Error('未找到该用户');
  }

  const flowId = await db
    .select({
      flowId: userFlow.id,
    })
    .from(userFlow)
    .where(eq(userFlow.fkUserId, userInfo.id))
    .then(res => {
      return res[0]?.flowId;
    });

  if (!flowId) {
    throw new Error('您还没有报名流程');
  }

  return flowId;
};
