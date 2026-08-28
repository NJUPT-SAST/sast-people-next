import { Button } from "../../ui/button";
import { displayFlow } from "@/types/flow";
import { EditSteps } from "./editSteps";
import { Delete } from "./delete";
import { Duplicate } from "./duplicate";
import Link from "next/link";

/** Compact on desktop table; larger touch targets on mobile card view. */
export const operationButtonClass =
  "h-10 shrink-0 rounded-lg px-3 text-sm shadow-none xl:h-8 xl:px-2";

export const Operations = ({ data }: { data: displayFlow }) => {
  return (
    <div className="flex w-full flex-wrap items-center justify-end gap-x-1 gap-y-2 xl:inline-grid xl:grid-cols-4 xl:justify-items-end">
      <EditSteps data={data} />
      <Duplicate data={data} />
      {data.type === "recruitment" ? (
        <Link href={`/dashboard/flow/edit-exam?id=${data.id}`}>
          <Button
            size="sm"
            variant="ghost"
            className={`${operationButtonClass} text-blue-600 hover:bg-blue-50 hover:text-blue-700 dark:text-blue-400 dark:hover:bg-blue-950/40 dark:hover:text-blue-300`}
          >
            编辑笔试
          </Button>
        </Link>
      ) : (
        <span
          aria-hidden="true"
          className="invisible select-none px-2 text-sm"
        >
          编辑笔试
        </span>
      )}
      <Delete data={data} />
    </div>
  );
};
