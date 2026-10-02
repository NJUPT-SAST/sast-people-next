'use server';
import { db } from '@/db/drizzle';
import { flow, problem, flowStep } from '@/db/schema';
import { verifyScopedRole } from '@/lib/authz';
import { isFlowVisibleToScope } from '@/lib/flow-access';
import { and, eq, count } from 'drizzle-orm';

/**
 * 流程各步骤的题目数量与「第一个有题目的步骤」。阅卷用：只有讲师及以上、
 * 且流程在本人部门可见范围内才返回，否则返回空结果（读路径用过滤，不用断言）。
 */
export const useStepWithProblem = async (flowId: number) => {
  const session = await verifyScopedRole(2);
  if (!(await isFlowVisibleToScope(session.scope, flowId))) {
    return { stepList: [], stepWithProblemId: null };
  }

  // Join steps with problems and get count of problems for each step in one query
  const stepList = await db
    .select({
      id: flowStep.id,
      title: flowStep.title,
      description: flowStep.description,
      fkFlowId: flowStep.fkFlowId,
      order: flowStep.order,
      problemCount: count(problem.id),
    })
    .from(flowStep)
    .innerJoin(flow, eq(flowStep.fkFlowId, flow.id))
    .leftJoin(problem, eq(problem.fkFlowStepId, flowStep.id))
    .where(and(eq(flowStep.fkFlowId, flowId), eq(flow.isDeleted, false)))
    .groupBy(flowStep.id);

  // Find the first step with a problem count greater than 0
  const stepWithProblem = stepList.find(step => step.problemCount > 0);

  return {
    stepList,
    stepWithProblemId: stepWithProblem ? stepWithProblem.id : null,
  };
};
