import { SelectFlow } from "@/components/recruitment/selectFlow";
import { RecruitmentContent } from "@/components/recruitment/recruitmentContent";
import { PageTitle } from "@/components/route";
import { useFlowList as getFlowList } from "@/hooks/useFlowList";
import { calScore } from "@/action/user-flow/user-point/calScore";
import { verifySession } from "@/lib/dal";

const Recruitment = async () => {
  const session = await verifySession();
  const flowTypes = await getFlowList();
  const defaultFlowId = flowTypes[0]?.id?.toString();
  const initialData = defaultFlowId
    ? await calScore(parseInt(defaultFlowId))
    : [];

  return (
    <>
      <div className="flex items-center justify-between">
        <PageTitle />
      </div>
      <div className="space-y-4 mt-4">
        <RecruitmentContent
          flowTypes={flowTypes}
          initialData={initialData}
          defaultFlowId={defaultFlowId}
          role={session.role}
        />
      </div>
    </>
  );
};

export default Recruitment;
