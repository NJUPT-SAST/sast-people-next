import { FlowTable, FlowTableColumns } from "@/components/flow/table";
import { useFlowList as getFlowList } from "@/hooks/useFlowList";

export const FlowTableServer = async ({ initialEditFlowId }: { initialEditFlowId?: number }) => {
  const data = await getFlowList();
  return <FlowTable columns={FlowTableColumns} data={data} initialEditFlowId={initialEditFlowId} />;
};
