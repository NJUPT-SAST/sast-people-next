import { PageTitle } from "@/components/route";
import { Skeleton } from "@/components/ui/skeleton";
import { Suspense } from "react";
import { AddFlow } from "@/components/flow/add";
import { FlowTableServer } from "./flowTable";

const FlowPage = async () => {
  return (
    <>
      <div className="flex w-full flex-col gap-3 border-b pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <PageTitle />
          <p className="text-sm text-muted-foreground">
            管理招新、WOC/WOD、SOC/SOD 等流程，维护时间、步骤与笔试题目。
          </p>
        </div>
        <AddFlow />
      </div>
      <div className="mt-1">
        <Suspense
          fallback={
            <>
              <Skeleton className="w-full h-[200px]" />
            </>
          }
        >
          <FlowTableServer />
        </Suspense>
      </div>
    </>
  );
};

export default FlowPage;
