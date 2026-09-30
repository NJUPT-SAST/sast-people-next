import { db } from "@/db/drizzle";
import { flowStep, problem } from "@/db/schema";
import type { displayFlow } from "@/types/flow";
import { eq } from "drizzle-orm";
import { FlowEditWorkspace } from "@/components/flow/operations/flowEditWorkspace";

export async function FlowEditWorkspaceServer({
  data,
  canChooseDepartment = false,
  readOnly = false,
  showProblems = true,
}: {
  data: displayFlow;
  canChooseDepartment?: boolean;
  /* 无编辑权时只读打开：流程、步骤与题目照常展示，表单控件整体禁用 */
  readOnly?: boolean;
  /* 试卷题目只给归属部门（或管理员）看：跨部门只读查看时不查询、也不下发题目 */
  showProblems?: boolean;
}) {
  if (data.type !== "recruitment") {
    return (
      <FlowEditWorkspace
        data={data}
        canChooseDepartment={canChooseDepartment}
        readOnly={readOnly}
      />
    );
  }

  /* 看不到题目的角色连查询都不做：数据不出服务端 */
  if (!showProblems) {
    return (
      <FlowEditWorkspace
        data={data}
        canChooseDepartment={canChooseDepartment}
        readOnly={readOnly}
        problemsHidden
      />
    );
  }

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
      canChooseDepartment={canChooseDepartment}
      readOnly={readOnly}
    />
  );
}
