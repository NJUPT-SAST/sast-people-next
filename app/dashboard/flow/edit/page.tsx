import { redirect } from "next/navigation";
import { FlowEditWorkspaceServer } from "@/components/flow/operations/flowEditWorkspaceServer";
import getFlowInfo from "@/hooks/useFlowInfo";
import { getDepartmentScope } from "@/lib/authz";
import { canEditFlowRecord } from "@/lib/flow-access";

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

  /* 只有流程归属部门、管理员或办公类共享流程的办公部门能进入编辑页，避免只读流程被直接打开编辑 */
  const scope = await getDepartmentScope();
  if (!canEditFlowRecord(scope, flowInfo)) redirect("/dashboard/flow");

  return (
    <FlowEditWorkspaceServer
      data={flowInfo}
      canChooseDepartment={scope.kind === "all"}
    />
  );
}
