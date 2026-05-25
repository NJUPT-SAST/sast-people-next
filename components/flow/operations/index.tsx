import { Button } from "../../ui/button";
import { displayFlow } from "@/types/flow";
import { EditSteps } from "./editSteps";
import { Delete } from "./delete";
import Link from "next/link";

export const Operations = ({ data }: { data: displayFlow }) => {
  return (
    <div className="grid w-full grid-cols-[4rem_4rem_4rem] items-center justify-end gap-1">
      <EditSteps data={data} />
      {data.type === "recruitment" && (
        <Link href={`/dashboard/flow/edit-exam?id=${data.id}`}>
          <Button size="sm" variant={"ghost"} className="min-w-16">编辑笔试</Button>
        </Link>
      )}
      {data.type !== "recruitment" && <span aria-hidden="true" />}
      <Delete data={data} />
    </div>
  );
};
