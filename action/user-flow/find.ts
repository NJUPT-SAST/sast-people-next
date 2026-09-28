'use server';

import { db } from '@/db/drizzle';
import { userFlow } from '@/db/schema';
import { verifySession } from '@/lib/dal';
import { assertUserFlowInScope } from '@/lib/flow-access';
import { getDepartmentScope } from '@/lib/authz';
import { findPeopleUserByStudentId } from '@/lib/link/user-lookup';
import { and, eq } from 'drizzle-orm';

export const findUserFlowId = async (
  studentId: string,
  flowId: number,
) => {
  // 阅卷入口：必须先确认登录，未登录直接由 verifySession 处理
  await verifySession();

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

  const scope = await getDepartmentScope();
  assertUserFlowInScope(scope, result.department, '该同学不属于当前部门，无法阅卷');

  return {
    id: result.id,
    progressStatus: result.progressStatus,
  };
};
