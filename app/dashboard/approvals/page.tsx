import { PageHeader, PageTitle } from "@/components/route";
import React from "react";
import { ApprovalsContent } from "@/components/manage/approvalsContent";
import { LinkLogin } from "@/components/linkLogin";
import { getAllEvaluations } from "@/action/user-flow/evaluation";
import { MissingLinkAdminAccessTokenError } from "@/lib/link/session";

export const dynamic = "force-dynamic";

const Approvals = async () => {
  let evaluations: Awaited<ReturnType<typeof getAllEvaluations>> = [];
  let loadError = false;
  let needsAdminAuthorization = false;

  try {
    evaluations = await getAllEvaluations();
  } catch (error) {
    if (error instanceof MissingLinkAdminAccessTokenError) {
      needsAdminAuthorization = true;
    } else {
      loadError = true;
    }
  }

  return (
    <>
      <PageHeader>
        <PageTitle />
      </PageHeader>
      <div>
        {needsAdminAuthorization ? (
          <div className="max-w-md space-y-4 rounded-md border bg-card p-6">
            <div className="space-y-1">
              <h2 className="text-base font-semibold">需要 Link 管理授权</h2>
              <p className="text-sm text-muted-foreground">
                授权后才能读取候选人与评审人资料并处理面评审批。
              </p>
            </div>
            <LinkLogin isBinding={false} purpose="admin" />
          </div>
        ) : (
          <ApprovalsContent
            initialEvaluations={evaluations}
            initialLoadError={loadError}
          />
        )}
      </div>
    </>
  );
};

export default Approvals;
