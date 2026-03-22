import { EditProblems } from "@/components/flow/operations/editProblems";
import { useStepWithProblem as getStepWithProblem } from "@/hooks/useStepWithProblem";
import { useProblems as getProblems } from "@/hooks/useProblemList";

export const EditProblemsServer = async ({ id }: { id: string }) => {
  const { stepList, stepWithProblemId } = await getStepWithProblem(Number(id));
  const problems = stepWithProblemId
    ? await getProblems(stepWithProblemId)
    : [];
  return (
    <>
      <EditProblems
        problems={problems}
        stepList={stepList}
        currentStepId={stepWithProblemId ?? 0}
        flowTypeId={Number(id)}
      />
    </>
  );
};
