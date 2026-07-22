import { PageHeader, PageTitle } from "@/components/route";
import { Skeleton } from "@/components/ui/skeleton";
import { Suspense } from "react";
import { AddFlow } from "@/components/flow/add";
import { FlowTableServer } from "./flowTable";

const FlowPage = async () => {
  return (
    <>
      <PageHeader className="border-b pb-4">
        <div className="min-w-0 space-y-1">
          <PageTitle />
          <p className="text-sm text-muted-foreground">
            管理招新、WOC/WOD、SOC/SOD 等流程，维护时间、步骤与笔试题目。
          </p>
        </div>
        <div className="w-full shrink-0 sm:w-auto">
          <AddFlow />
        </div>
      </PageHeader>
      <div className="mt-1">
        <Suspense fallback={<Skeleton className="h-[200px] w-full" />}>
          <FlowTableServer />
        </Suspense>
      </div>
    </>
  );
};

export default FlowPage;
