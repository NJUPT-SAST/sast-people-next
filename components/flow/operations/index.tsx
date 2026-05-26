import { Button } from "../../ui/button";
import { displayFlow } from "@/types/flow";
import { EditSteps } from "./editSteps";
import { Delete } from "./delete";
import Link from "next/link";

export const Operations = ({ data }: { data: displayFlow }) => {
  return (
    <div className="grid w-full grid-cols-[4.5rem_4.5rem_3.5rem] items-center justify-end gap-1">
      <EditSteps data={data} />
      {data.type === "recruitment" && (
        <Link href={`/dashboard/flow/edit-exam?id=${data.id}`}>
          <Button size="sm" variant="ghost" className="h-8 rounded-lg px-2.5 text-blue-600 shadow-none hover:bg-blue-50 hover:text-blue-700 dark:text-blue-400 dark:hover:bg-blue-950/40 dark:hover:text-blue-300">
            编辑笔试
          </Button>
        </Link>
      )}
      {data.type !== "recruitment" && <span aria-hidden="true" />}
      <Delete data={data} />
    </div>
  );
};
