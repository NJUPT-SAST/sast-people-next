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
      <div className="flex flex-col gap-1 border-b pb-4">
        <PageTitle />
        <p className="text-sm text-muted-foreground">
          按流程查看报名人员，处理面评结果、筛选笔试成绩并发送最终通知。
        </p>
      </div>
      <div className="mt-5">
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
