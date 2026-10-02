import { PageHeader, PageTitle } from "@/components/route";
import React from "react";
import { ApprovalsContent } from "@/components/manage/approvalsContent";
import { getAllEvaluations } from "@/action/user-flow/evaluation";
import { verifySession } from "@/lib/dal";
import { ADMIN_ROLE } from "@/lib/link/role";

export const dynamic = "force-dynamic";

const Approvals = async () => {
  const session = await verifySession();
  let evaluations: Awaited<ReturnType<typeof getAllEvaluations>> = [];
  let loadError = false;
  try {
    evaluations = await getAllEvaluations();
  } catch (error) {
    void error;
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
          canFilterDepartments={session.role >= ADMIN_ROLE}
        />
      </div>
    </>
  );
};

export default Approvals;
