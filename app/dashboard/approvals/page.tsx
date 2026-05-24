import { PageTitle } from "@/components/route";
import React from "react";
import { ApprovalsContent } from "@/components/manage/approvalsContent";

const Approvals = async () => {
  return (
    <>
      <div className="flex items-center justify-between">
        <PageTitle />
      </div>
      <div>
        <ApprovalsContent />
      </div>
    </>
  );
};

export default Approvals;
