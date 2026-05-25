import { RecruitmentContent } from "@/components/recruitment/recruitmentContent";
import { PageTitle } from "@/components/route";
import { useFlowList as getFlowList } from "@/hooks/useFlowList";
import { calScore } from "@/action/user-flow/user-point/calScore";
import { getEvaluationCandidates } from "@/action/user-flow/evaluation";
import { verifySession } from "@/lib/dal";

const EVALUATION_FLOW_TYPES = ["woc", "soc", "recruitment_exemption"];

const Recruitment = async () => {
  const session = await verifySession();
  const flowTypes = await getFlowList();
  const defaultFlow = flowTypes[0];
  const defaultFlowId = defaultFlow?.id?.toString();
  const isDefaultEvaluationFlow = defaultFlow
    ? EVALUATION_FLOW_TYPES.includes(defaultFlow.type)
    : false;
  const initialData = defaultFlowId && !isDefaultEvaluationFlow
    ? await calScore(parseInt(defaultFlowId))
    : [];
  const initialEvalData = defaultFlowId && isDefaultEvaluationFlow
    ? await getEvaluationCandidates(parseInt(defaultFlowId))
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
          initialEvalData={initialEvalData}
          defaultFlowId={defaultFlowId}
          role={session.role}
        />
      </div>
    </>
  );
};

export default Recruitment;
