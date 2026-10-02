import { redirect } from "next/navigation";
import { FlowEditWorkspaceServer } from "@/components/flow/operations/flowEditWorkspaceServer";
import getFlowInfo from "@/hooks/useFlowInfo";
import { getDepartmentScope } from "@/lib/authz";
import { canEditFlowRecord, isFlowVisibleToScope } from "@/lib/flow-access";

export default async function EditFlowPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  const params = await searchParams;
  const flowId = Number(params.id);
  if (!Number.isInteger(flowId) || flowId <= 0) redirect("/dashboard/flow");

  const flowInfo = await getFlowInfo(flowId).catch(() => null);
  if (!flowInfo) redirect("/dashboard/flow");

  /* 没有编辑权也能进来只读查看：能看见的流程就能看详情，
     只有归属部门（或管理员）才看得到试卷题目，其他部门只展示流程、步骤与说明 */
  const scope = await getDepartmentScope();
  const canEdit = canEditFlowRecord(scope, flowInfo);
  const showProblems =
    scope.kind === "all" || (await isFlowVisibleToScope(scope, flowId));

  return (
    <FlowEditWorkspaceServer
      data={flowInfo}
      canChooseDepartment={scope.kind === "all"}
      readOnly={!canEdit}
      showProblems={showProblems}
    />
  );
}
