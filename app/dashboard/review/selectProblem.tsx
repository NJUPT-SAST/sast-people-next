import SelectProblem from "@/components/review/selectProblem";
import { displayFlow } from "@/types/flow";

export const SelectProblemServer = ({ flowList }: { flowList: displayFlow[] }) => {
  return <SelectProblem flowList={flowList} />;
};
