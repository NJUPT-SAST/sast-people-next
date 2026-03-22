import { SelectFlow } from "@/components/recruitment/selectFlow";
import { useFlowList as getFlowList } from "@/hooks/useFlowList";
import React from "react";

const RegisteredPersonTableLayout = async ({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{
    flowId: string;
  }>;
}) => {
  const { flowId } = await params;
  const flowTypes = await getFlowList();
  return (
    <>
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold md:text-2xl">招新成绩</h1>
      </div>
      <div className="space-y-4 mt-4">
        <SelectFlow flowTypes={flowTypes} defaultFlowTypeId={flowId} />
        {children}
      </div>
    </>
  );
};

export default RegisteredPersonTableLayout;
