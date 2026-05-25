import { PageTitle } from "@/components/route";
import React from "react";
import { ApprovalsContent } from "@/components/manage/approvalsContent";
import { getAllEvaluations } from "@/action/user-flow/evaluation";

const Approvals = async () => {
  const evaluations = await getAllEvaluations();

  return (
    <>
      <div className="flex items-center justify-between">
        <PageTitle />
      </div>
      <div>
        <ApprovalsContent initialEvaluations={evaluations} />
      </div>
    </>
  );
};

export default Approvals;
