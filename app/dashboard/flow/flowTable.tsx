import { FlowTable, FlowTableColumns } from "@/components/flow/table";
import { useFlowList as getFlowList } from "@/hooks/useFlowList";
import type { DepartmentScope } from "@/lib/authz";
import { canEditFlow } from "@/lib/flow-access";

export const FlowTableServer = async ({
  initialEditFlowId,
  scope,
}: {
  initialEditFlowId?: number;
  scope: DepartmentScope;
}) => {
  const data = await getFlowList();
  /* 编辑/删除/复制入口只在流程归属部门（或管理员）下展示，服务端仍会二次校验 */
  const editableFlowIds = data
    .filter((item) => canEditFlow(scope, item.department))
    .map((item) => item.id);

  return (
    <FlowTable
      columns={FlowTableColumns}
      data={data}
      initialEditFlowId={initialEditFlowId}
      editableFlowIds={editableFlowIds}
      canChooseDepartment={scope.kind === "all"}
    />
  );
};
