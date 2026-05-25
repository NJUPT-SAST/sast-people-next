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
      type: flowStep.type,
    })
    .from(flowStep)
    .where(eq(flowStep.fkFlowId, flowId))
    .orderBy(flowStep.order);

  const targetStep =
    steps.find((step) => step.type === "judging") ??
    steps.find((step) => step.title.includes("批卷")) ??
    steps[0];
  const stepIds = steps.map((s) => s.id);

  const allProblems = stepIds.length > 0
    ? await db
        .select()
        .from(problem)
        .where(inArray(problem.fkFlowStepId, stepIds))
    : [];

  const problemsByStep: Record<number, typeof allProblems> = targetStep
    ? { [targetStep.id]: allProblems }
    : {};

  return (
    <EditProblems
      steps={targetStep ? [targetStep] : []}
      problemsByStep={problemsByStep}
      defaultStepId={targetStep?.id ?? 0}
      flowTypeId={flowId}
    />
  );
};
