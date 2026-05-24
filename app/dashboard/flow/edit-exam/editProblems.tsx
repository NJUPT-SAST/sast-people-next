import { EditProblems } from "@/components/flow/operations/editProblems";
import { db } from '@/db/drizzle';
import { problem, flowStep } from '@/db/schema';
import { eq, inArray } from 'drizzle-orm';

export const EditProblemsServer = async ({ id }: { id: string }) => {
  const flowId = Number(id);

  const steps = await db
    .select({
      id: flowStep.id,
      title: flowStep.title,
      description: flowStep.description,
      fkFlowId: flowStep.fkFlowId,
      order: flowStep.order,
    })
    .from(flowStep)
    .where(eq(flowStep.fkFlowId, flowId))
    .orderBy(flowStep.order);

  const stepIds = steps.map((s) => s.id);

  const allProblems = stepIds.length > 0
    ? await db
        .select()
        .from(problem)
        .where(inArray(problem.fkFlowStepId, stepIds))
    : [];

  const problemsByStep: Record<number, typeof allProblems> = {};
  for (const p of allProblems) {
    (problemsByStep[p.fkFlowStepId] ??= []).push(p);
  }

  const defaultStepId = steps.find((s) => problemsByStep[s.id]?.length > 0)?.id ?? steps[0]?.id ?? 0;

  return (
    <EditProblems
      steps={steps}
      problemsByStep={problemsByStep}
      defaultStepId={defaultStepId}
      flowTypeId={flowId}
    />
  );
};
