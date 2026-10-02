'use server';
import { db } from '@/db/drizzle';
import { flowStep, problem } from '@/db/schema';
import { verifyScopedRole } from '@/lib/authz';
import { isFlowVisibleToScope } from '@/lib/flow-access';
import { asc, eq, InferSelectModel } from 'drizzle-orm';

/**
 * 某步骤的题目（含分值）。阅卷用：只有讲师及以上、且流程在本人部门可见范围内才返回，
 * 否则返回空数组（读路径用过滤，不用断言，避免把页面打成错误）。
 */
export const useProblems = async (flowStepId: number): Promise<InferSelectModel<typeof problem>[]> => {
  const session = await verifyScopedRole(2);

  const [step] = await db
    .select({ flowId: flowStep.fkFlowId })
    .from(flowStep)
    .where(eq(flowStep.id, flowStepId))
    .limit(1);
  if (!step) return [];
  if (!(await isFlowVisibleToScope(session.scope, step.flowId))) return [];

  const problems = await db
    .select()
    .from(problem)
    .orderBy(asc(problem.title))
    .where(eq(problem.fkFlowStepId, flowStepId));
  return problems;
};
