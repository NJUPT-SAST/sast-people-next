import SelectProblem from "@/components/review/selectProblem";
import { useFlowList as getFlowList } from "@/hooks/useFlowList";

export const SelectProblemServer = async () => {
  const flow = await getFlowList();
  return <SelectProblem flowList={flow} />;
};
