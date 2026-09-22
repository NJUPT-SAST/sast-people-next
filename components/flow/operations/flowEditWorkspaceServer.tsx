import { db } from "@/db/drizzle";
import { flowStep, problem } from "@/db/schema";
import type { displayFlow } from "@/types/flow";
import { eq, inArray } from "drizzle-orm";
import { FlowEditWorkspace } from "./flowEditWorkspace";

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
  const stepIds = steps.map((step) => step.id);
  const allProblems = stepIds.length > 0
    ? await db.select().from(problem).where(inArray(problem.fkFlowStepId, stepIds))
    : [];

  return (
    <FlowEditWorkspace
      data={data}
      steps={targetStep ? [targetStep] : []}
      problemsByStep={targetStep ? { [targetStep.id]: allProblems } : {}}
      defaultStepId={targetStep?.id ?? 0}
    />
  );
}
