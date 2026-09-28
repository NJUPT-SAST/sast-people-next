import { displayFlow } from "@/types/flow";
import { EditSteps } from "./editSteps";
import { Delete } from "./delete";
import { Duplicate } from "./duplicate";

/** Compact on desktop table; larger touch targets on mobile card view. */
export const operationButtonClass =
  "h-9 shrink-0 rounded-md px-3 text-sm shadow-none xl:h-8 xl:px-2";

export const Operations = ({
  data,
  initialEditFlowId,
  canEdit,
  canChooseDepartment = false,
}: {
  data: displayFlow;
  initialEditFlowId?: number;
  /* 流程归属部门或管理员才展示编辑入口，服务端仍会二次校验 */
  canEdit: boolean;
  canChooseDepartment?: boolean;
}) => {
  if (!canEdit) {
    return <span className="text-xs text-muted-foreground">只读</span>;
  }

  return (
    <div className="flex w-full flex-wrap items-center justify-end gap-1.5 xl:flex-nowrap">
      <EditSteps
        data={data}
        autoOpen={data.id === initialEditFlowId}
        linkOnly={data.id !== initialEditFlowId}
        canChooseDepartment={canChooseDepartment}
      />
      <Duplicate data={data} />
      <Delete data={data} />
    </div>
  );
};
