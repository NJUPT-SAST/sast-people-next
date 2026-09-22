import { db } from "@/db/drizzle";
import { flowStep, problem } from "@/db/schema";
import type { displayFlow } from "@/types/flow";
import { eq } from "drizzle-orm";
import { FlowEditWorkspace } from "@/components/flow/operations/flowEditWorkspace";

export async function FlowEditWorkspaceServer({ data }: { data: displayFlow }) {
  if (data.type !== "recruitment") return <FlowEditWorkspace data={data} />;

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
    .where(eq(flowStep.fkFlowId, data.id))
    .orderBy(flowStep.order);

  const targetStep =
    steps.find((step) => step.type === "judging") ??
    steps.find((step) => step.title.includes("批卷")) ??
    steps[0];
  const targetProblems = targetStep
    ? await db.select().from(problem).where(eq(problem.fkFlowStepId, targetStep.id))
    : [];

  return (
    <FlowEditWorkspace
      data={data}
      steps={targetStep ? [targetStep] : []}
      problemsByStep={targetStep ? { [targetStep.id]: targetProblems } : {}}
      defaultStepId={targetStep?.id ?? 0}
    />
  );
}
