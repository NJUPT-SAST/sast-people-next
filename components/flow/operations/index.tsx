import { displayFlow } from "@/types/flow";
import { EditSteps } from "./editSteps";
import { Delete } from "./delete";
import { Duplicate } from "./duplicate";

/** Compact on desktop table; larger touch targets on mobile card view. */
export const operationButtonClass =
  "h-10 shrink-0 rounded-lg px-3 text-sm shadow-none xl:h-8 xl:px-2";

export const Operations = ({ data, initialEditFlowId }: { data: displayFlow; initialEditFlowId?: number }) => {
  return (
    <div className="flex w-full flex-wrap items-center justify-end gap-x-1 gap-y-2 xl:inline-grid xl:grid-cols-4 xl:justify-items-end">
      <EditSteps data={data} autoOpen={data.id === initialEditFlowId} linkOnly />
      <Duplicate data={data} />
      <Delete data={data} />
    </div>
  );
};
