'use client';

import { useState } from 'react';
import { SelectFlow } from '@/components/recruitment/selectFlow';
import { DataTable } from '@/components/recruitment/table';
import { EvaluationTable } from '@/components/recruitment/evaluationTable';
import { columns } from '@/components/recruitment/columns';
import { calScore } from '@/action/user-flow/user-point/calScore';
import { getEvaluationCandidates } from '@/action/user-flow/evaluation';
import { Loading } from '@/components/loading';
import { displayFlow } from '@/types/flow';

type ExamResult = Awaited<ReturnType<typeof calScore>>;
type CandidatesResult = Awaited<ReturnType<typeof getEvaluationCandidates>>;

const EVALUATION_FLOW_TYPES = ['woc', 'soc', 'recruitment_exemption'];

export const RecruitmentContent = ({
  flowTypes,
  initialData,
  initialEvalData,
  defaultFlowId,
  role,
}: {
  flowTypes: displayFlow[];
  initialData: ExamResult;
  initialEvalData: CandidatesResult;
  defaultFlowId?: string;
  role: number;
}) => {
  const [flowId, setFlowId] = useState(defaultFlowId);
  const [scoreData, setScoreData] = useState(initialData);
  const [evalData, setEvalData] = useState<CandidatesResult>(initialEvalData);
  const [loading, setLoading] = useState(false);

  const selectedFlow = flowTypes.find((f) => f.id === parseInt(flowId ?? ''));
  const isEvaluationFlow = selectedFlow
    ? EVALUATION_FLOW_TYPES.includes(selectedFlow.type)
    : false;

  const handleFlowChange = async (value: string) => {
    setFlowId(value);
    setLoading(true);
    const flow = flowTypes.find((f) => f.id === parseInt(value));
    try {
      if (flow && EVALUATION_FLOW_TYPES.includes(flow.type)) {
        const candidates = await getEvaluationCandidates(parseInt(value));
        setEvalData(candidates);
      } else {
        const scores = await calScore(parseInt(value));
        setScoreData(scores);
      }
    } catch {
      setScoreData([]);
      setEvalData([]);
    } finally {
      setLoading(false);
    }
  };

  const refreshEvalData = async () => {
    if (!flowId) return;
    try {
      const candidates = await getEvaluationCandidates(parseInt(flowId));
      setEvalData(candidates);
    } catch {
      setEvalData([]);
    }
  };

  const averageScore =
    scoreData.length === 0
      ? 0
      : scoreData.reduce(
          (acc, cur) => acc + parseInt(cur.totalScore ?? '0', 10),
          0,
        ) / scoreData.length;

  return (
    <>
      <SelectFlow
        flowTypes={flowTypes}
        defaultFlowTypeId={flowId}
        onChange={handleFlowChange}
      />
      {flowId ? (
        loading ? (
          <Loading />
        ) : isEvaluationFlow ? (
          <>
            <p className="text-muted-foreground">
              总人数：{evalData.length}
            </p>
            <EvaluationTable
              candidates={evalData}
              role={role}
              onRefresh={refreshEvalData}
            />
          </>
        ) : (
          <>
            <p className="text-muted-foreground">
              总人数：{scoreData.length} &nbsp; 平均分：
              {averageScore.toFixed(2)}
            </p>
            <DataTable
              columns={columns}
              data={scoreData}
              flowTypeId={parseInt(flowId)}
              role={role}
            />
          </>
        )
      ) : (
        <p className="text-muted-foreground">暂无流程</p>
      )}
    </>
  );
};
