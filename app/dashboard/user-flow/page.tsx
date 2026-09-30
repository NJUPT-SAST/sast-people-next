import { PageHeader, PageTitle } from "@/components/route";
import SubmitRegister from "@/components/userFlow/submitRegister";
import React, { Suspense } from "react";
import { useFlowList as getFlowList } from "@/hooks/useFlowList";
import { useMyFlowList as getMyFlowList } from "@/hooks/useMyFlowList";
import { verifySession } from "@/lib/dal";
import { Skeleton } from "@/components/ui/skeleton";
import { FlowList } from "./flowList";

const Flows = async () => {
  const { uid } = await verifySession();
  const [allFlowListResult, myFlowListResult] = await Promise.all([
    getFlowList(),
    /* 办公类二轮面试的「先通过一轮」前端提示需要本人已报名流程 */
    getMyFlowList(),
  ]);
  const allFlowList = Array.isArray(allFlowListResult) ? allFlowListResult : [];
  const myFlowList = Array.isArray(myFlowListResult) ? myFlowListResult : [];
  return (
    <>
      <PageHeader>
        <PageTitle />
        <div className="w-full sm:w-auto">
          <SubmitRegister
            flowList={allFlowList}
            uid={uid}
            myFlowList={myFlowList}
          />
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
