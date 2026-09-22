import { redirect } from "next/navigation";
import { FlowEditWorkspaceServer } from "@/components/flow/operations/flowEditWorkspaceServer";
import getFlowInfo from "@/hooks/useFlowInfo";

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

  return <FlowEditWorkspaceServer data={flowInfo} />;
}
