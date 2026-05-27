import { PageTitle } from "@/components/route";
import React from "react";
import { ApprovalsContent } from "@/components/manage/approvalsContent";
import { getAllEvaluations } from "@/action/user-flow/evaluation";
import { logServerError } from "@/lib/server-error-log";

export const dynamic = "force-dynamic";

const Approvals = async () => {
  let evaluations: Awaited<ReturnType<typeof getAllEvaluations>> = [];
  let loadError = false;

  try {
    evaluations = await getAllEvaluations();
  } catch (error) {
    loadError = true;
    console.error("Failed to load approval evaluations:", error);
    logServerError("approvals:getAllEvaluations", error, {
      path: "/dashboard/approvals",
      action: "load-approval-evaluations",
    });
  }

  return (
    <>
      <div className="flex items-center justify-between">
        <PageTitle />
      </div>
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
