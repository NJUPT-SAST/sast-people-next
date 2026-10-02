'use server';

import { db } from '@/db/drizzle';
import { userFlow } from '@/db/schema';
import { verifyScopedRole } from '@/lib/authz';
import { assertUserFlowInScope } from '@/lib/flow-access';
import { findPeopleUserByStudentId } from '@/lib/link/user-lookup';
import { and, eq } from 'drizzle-orm';

export const findUserFlowId = async (
  studentId: string,
  flowId: number,
) => {
  // 阅卷入口：只有讲师及以上、且归属部门在严格模式下才可用
  const session = await verifyScopedRole(2);

  const userInfo = await findPeopleUserByStudentId(studentId);
  if (!userInfo) {
    return null;
  }

  const [result] = await db
    .select({
      id: userFlow.id,
      progressStatus: userFlow.progressStatus,
      department: userFlow.department,
    })
    .from(userFlow)
    .where(and(eq(userFlow.fkUserId, userInfo.id), eq(userFlow.fkFlowId, flowId)));

  if (!result) {
    return null;
  }

  assertUserFlowInScope(session.scope, result.department, '该同学不属于当前部门，无法阅卷');

  return {
    id: result.id,
    progressStatus: result.progressStatus,
  };
};
