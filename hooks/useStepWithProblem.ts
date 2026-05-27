'use server';
import { db } from '@/db/drizzle';
import { flow, problem, flowStep } from '@/db/schema';
import { and, eq, count } from 'drizzle-orm';

export const useStepWithProblem = async (flowId: number) => {
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
