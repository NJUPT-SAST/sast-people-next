import { PageHeader, PageTitle } from "@/components/route";
import React from "react";
import { ApprovalsContent } from "@/components/manage/approvalsContent";
import { getAllEvaluations } from "@/action/user-flow/evaluation";

export const dynamic = "force-dynamic";

const Approvals = async () => {
  let evaluations: Awaited<ReturnType<typeof getAllEvaluations>> = [];
  let loadError = false;

  try {
    evaluations = await getAllEvaluations();
  } catch {
    loadError = true;
  }

  return (
    <>
      <PageHeader>
        <PageTitle />
      </PageHeader>
      <div>
        <ApprovalsContent
          initialEvaluations={evaluations}
          initialLoadError={loadError}
        />
      </div>
    </>
  );
};

export default Approvals;
