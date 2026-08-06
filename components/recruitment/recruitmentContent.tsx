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
import { BadgeCheck, ClipboardList, Users } from 'lucide-react';

type ExamResult = Awaited<ReturnType<typeof calScore>>;
type CandidatesResult = Awaited<ReturnType<typeof getEvaluationCandidates>>;

const EVALUATION_FLOW_TYPES = ['woc', 'soc', 'recruitment_exemption'];

export const RecruitmentContent = ({
  flowTypes,
  initialData,
  initialEvalData,
  defaultFlowId,
  targetUserFlowId,
  targetScheduleId,
  role,
}: {
  flowTypes: displayFlow[];
  initialData: ExamResult;
  initialEvalData: CandidatesResult;
  defaultFlowId?: string;
  targetUserFlowId?: number;
  targetScheduleId?: number;
  role: number;
}) => {
  const [flowId, setFlowId] = useState(defaultFlowId);
  const [scoreData, setScoreData] = useState(initialData);
  const [evalData, setEvalData] = useState<CandidatesResult>(initialEvalData);
  const [loading, setLoading] = useState(false);
  const safeFlowTypes = Array.isArray(flowTypes) ? flowTypes : [];
  const safeScoreData = Array.isArray(scoreData) ? scoreData : [];
  const safeEvalData = Array.isArray(evalData) ? evalData : [];

  const selectedFlow = safeFlowTypes.find((f) => f.id === parseInt(flowId ?? ''));
  const isEvaluationFlow = selectedFlow
    ? EVALUATION_FLOW_TYPES.includes(selectedFlow.type)
    : false;

  const handleFlowChange = async (value: string) => {
    setFlowId(value);
    setLoading(true);
    const flow = safeFlowTypes.find((f) => f.id === parseInt(value));
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
    safeScoreData.length === 0
      ? 0
      : safeScoreData.reduce(
          (acc, cur) => acc + parseInt(cur.totalScore ?? '0', 10),
          0,
        ) / safeScoreData.length;

  return (
    <div className="min-w-0 space-y-4">
      <section className="border-y bg-muted/20">
        <div className="flex flex-col gap-4 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-1">
            <p className="text-sm font-medium">选择流程</p>
            <p className="text-xs text-muted-foreground">
              切换流程后，下方列表会自动刷新对应报名人员。
            </p>
          </div>
          <SelectFlow
            flowTypes={safeFlowTypes}
            defaultFlowTypeId={flowId}
            onChange={handleFlowChange}
          />
        </div>

        {flowId && !loading && (
          <div className="flex flex-wrap gap-x-6 gap-y-2 border-t bg-muted/10 px-4 py-2.5 text-sm">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Users className="size-4" />
              <span>总人数</span>
              <span className="font-semibold tabular-nums text-foreground">
                {isEvaluationFlow ? safeEvalData.length : safeScoreData.length}
              </span>
            </div>
            {!isEvaluationFlow && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <BadgeCheck className="size-4" />
                <span>平均分</span>
                <span className="font-semibold tabular-nums text-foreground">
                  {averageScore.toFixed(2)}
                </span>
              </div>
            )}
            <div className="flex items-center gap-2 text-muted-foreground">
              <ClipboardList className="size-4" />
              <span>流程类型</span>
              <span className="font-medium text-foreground">
                {isEvaluationFlow ? '面评审核' : '笔试成绩'}
              </span>
            </div>
          </div>
        )}
      </section>

      {flowId ? (
        loading ? (
          <Loading />
        ) : isEvaluationFlow ? (
          <div className="space-y-4">
            <EvaluationTable
              candidates={safeEvalData}
              role={role}
              targetUserFlowId={targetUserFlowId}
              targetScheduleId={targetScheduleId}
              onRefresh={refreshEvalData}
            />
          </div>
        ) : (
          <div className="space-y-4">
            <DataTable
              columns={columns}
              data={safeScoreData}
              flowTypeId={parseInt(flowId)}
              targetUserFlowId={targetUserFlowId}
              role={role}
            />
          </div>
        )
      ) : (
        <div className="rounded-lg border bg-card p-8 text-center text-sm text-muted-foreground">
          暂无流程
        </div>
      )}
    </div>
  );
};
