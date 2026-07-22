import { Button } from "../../ui/button";
import { displayFlow } from "@/types/flow";
import { EditSteps } from "./editSteps";
import { Delete } from "./delete";
import { Duplicate } from "./duplicate";
import Link from "next/link";

const operationButtonClass =
  "h-10 min-w-10 rounded-lg px-3 text-sm shadow-none sm:h-8 sm:min-w-0 sm:px-2.5";

export const Operations = ({ data }: { data: displayFlow }) => {
  return (
    <div className="flex w-full flex-wrap items-center justify-end gap-1.5">
      <EditSteps data={data} />
      <Duplicate data={data} />
      {data.type === "recruitment" && (
        <Link href={`/dashboard/flow/edit-exam?id=${data.id}`}>
          <Button
            size="sm"
            variant="ghost"
            className={`${operationButtonClass} text-blue-600 hover:bg-blue-50 hover:text-blue-700 dark:text-blue-400 dark:hover:bg-blue-950/40 dark:hover:text-blue-300`}
          >
            编辑笔试
          </Button>
        </Link>
      )}
      <Delete data={data} />
    </div>
  );
};

export { operationButtonClass };
