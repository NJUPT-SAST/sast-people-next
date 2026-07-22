import { PageHeader, PageTitle } from "@/components/route";
import SubmitRegister from "@/components/userFlow/submitRegister";
import React, { Suspense } from "react";
import { useFlowList as getFlowList } from "@/hooks/useFlowList";
import { verifySession } from "@/lib/dal";
import { Skeleton } from "@/components/ui/skeleton";
import { FlowList } from "./flowList";

const Flows = async () => {
  const { uid } = await verifySession();
  const allFlowListResult = await getFlowList();
  const allFlowList = Array.isArray(allFlowListResult) ? allFlowListResult : [];
  return (
    <>
      <PageHeader>
        <PageTitle />
        <div className="w-full sm:w-auto">
          <SubmitRegister flowList={allFlowList} uid={uid} />
        </div>
      </PageHeader>
      <div className="mt-4 space-y-4">
        <Suspense
          fallback={
            <div className="flex flex-col gap-3">
              <Skeleton className="h-[220px] w-full" />
              <Skeleton className="h-[220px] w-full" />
              <Skeleton className="h-[220px] w-full" />
            </div>
          }
        >
          <FlowList />
        </Suspense>
      </div>
    </>
  );
};

export default Flows;
