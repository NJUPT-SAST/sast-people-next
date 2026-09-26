'use client';

import { useCallback, useRef, useState } from 'react';
import { AlertCircle } from 'lucide-react';
import { SelectFlow } from '@/components/recruitment/selectFlow';
import { DataTable } from '@/components/recruitment/table';
import { EvaluationTable } from '@/components/recruitment/evaluationTable';
import { makeColumns } from '@/components/recruitment/columns';
import { calScore } from '@/action/user-flow/user-point/calScore';
import { getEvaluationCandidates } from '@/action/user-flow/evaluation';
import { Loading } from '@/components/loading';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { flowSelection } from '@/types/flow';
import { BadgeCheck, ClipboardList, Users } from 'lucide-react';
import { ResultPublicationPanel } from '@/components/recruitment/ResultPublicationPanel';

type ExamResult = Awaited<ReturnType<typeof calScore>>;
type CandidatesResult = Awaited<ReturnType<typeof getEvaluationCandidates>>;
type RecruitmentWorkspaceMode = 'written' | 'interview';

const interviewTypeTabs = [
  { value: 'recruitment_exemption', label: '免试招新' },
  { value: 'woc', label: 'WOC/WOD' },
  { value: 'soc', label: 'SOC/SOD' },
] as const;

type InterviewFlowType = (typeof interviewTypeTabs)[number]['value'];

/**
 * A failed load must never look like an empty flow, so the panel states the
 * failure and offers a retry instead of falling through to the empty copy.
 */
const LOAD_ERROR_MESSAGE = '无法加载该流程的候选人，请检查网络后重试。';

function getInterviewFlowType(flowTypes: flowSelection[], flowId?: string) {
  const type = flowTypes.find((flow) => flow.id === Number(flowId))?.type;
  const matchingTab = interviewTypeTabs.find((tab) => tab.value === type);
  return matchingTab?.value ?? interviewTypeTabs[0].value;
}

export const RecruitmentContent = ({
  flowTypes,
  initialData,
  initialEvalData,
  defaultFlowId,
  targetUserFlowId,
  targetScheduleId,
  role,
  mode,
}: {
  flowTypes: flowSelection[];
  initialData: ExamResult;
  initialEvalData: CandidatesResult;
  defaultFlowId?: string;
  targetUserFlowId?: number;
  targetScheduleId?: number;
  role: number;
  mode: RecruitmentWorkspaceMode;
}) => {
  const [flowId, setFlowId] = useState(defaultFlowId);
  const [scoreData, setScoreData] = useState(initialData);
  const [evalData, setEvalData] = useState<CandidatesResult>(initialEvalData);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [publicationRefreshKey, setPublicationRefreshKey] = useState(0);
  const [publicationStatus, setPublicationStatus] = useState<string | null>(null);
  const flowRequestId = useRef(0);
  const safeFlowTypes = Array.isArray(flowTypes) ? flowTypes : [];
  const safeScoreData = Array.isArray(scoreData) ? scoreData : [];
  const safeEvalData = Array.isArray(evalData) ? evalData : [];
  const currentFlowGroupOptions =
    safeFlowTypes.find((flow) => flow.id === Number(flowId))?.groupOptions ?? [];

  const isEvaluationWorkspace = mode === 'interview';
  const [interviewFlowType, setInterviewFlowType] = useState<InterviewFlowType>(
    () => getInterviewFlowType(safeFlowTypes, defaultFlowId),
  );
  const visibleFlowTypes = isEvaluationWorkspace
    ? safeFlowTypes.filter((flow) => flow.type === interviewFlowType)
    : safeFlowTypes;

  const handleFlowChange = async (value: string) => {
    const requestId = ++flowRequestId.current;
    setFlowId(value);
    setPublicationStatus(null);
    setLoadError(null);
    setLoading(true);
    try {
      if (isEvaluationWorkspace) {
        const candidates = await getEvaluationCandidates(parseInt(value));
        if (requestId === flowRequestId.current) {
          setEvalData(candidates);
        }
      } else {
        const scores = await calScore(parseInt(value));
        if (requestId === flowRequestId.current) {
          setScoreData(scores);
        }
      }
    } catch {
      if (requestId === flowRequestId.current) {
        setScoreData([]);
        setEvalData([]);
        setPublicationStatus(null);
        setLoadError(LOAD_ERROR_MESSAGE);
      }
    } finally {
      if (requestId === flowRequestId.current) {
        setLoading(false);
      }
    }
  };

  const handlePublicationStatusChange = useCallback((status: string | null) => {
    setPublicationStatus(status);
  }, []);

  const refreshEvalData = async () => {
    if (!flowId) return;
    const requestId = ++flowRequestId.current;
    try {
      const candidates = await getEvaluationCandidates(parseInt(flowId));
      if (requestId === flowRequestId.current) {
        setEvalData(candidates);
        setLoadError(null);
      }
    } catch {
      if (requestId === flowRequestId.current) {
        setEvalData([]);
        setLoadError(LOAD_ERROR_MESSAGE);
      }
    }
  };

  const refreshEvalDataAndPublication = async () => {
    await refreshEvalData();
    setPublicationRefreshKey((value) => value + 1);
  };

  const retryLoad = () => {
    if (flowId) void handleFlowChange(flowId);
  };

  const handleInterviewFlowTypeChange = async (value: string) => {
    const nextType = value as InterviewFlowType;
    const nextFlow = safeFlowTypes.find((flow) => flow.type === nextType);
    setInterviewFlowType(nextType);
    setFlowId(nextFlow?.id.toString());
    if (!nextFlow) {
      ++flowRequestId.current;
      setLoading(false);
      setEvalData([]);
      setLoadError(null);
      return;
    }
    await handleFlowChange(nextFlow.id.toString());
  };

  const averageScore =
    safeScoreData.length === 0
      ? 0
      : safeScoreData.reduce(
          (acc, cur) => acc + parseInt(cur.totalScore ?? '0', 10),
          0,
        ) / safeScoreData.length;

  const errorPanel = (
    <div className="rounded-lg border bg-card p-10 text-center">
      <div className="mx-auto mb-3 flex size-10 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <AlertCircle className="size-5" aria-hidden="true" />
      </div>
      <p className="text-sm font-medium">列表加载失败</p>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">
        {loadError}
      </p>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="mt-4"
        onClick={retryLoad}
        disabled={loading}
      >
        {loading ? '重试中…' : '重试'}
      </Button>
    </div>
  );

  return (
    <div className="min-w-0 space-y-4">
      <section className="rounded-lg border bg-card">
        <div className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 flex-col gap-3">
            {isEvaluationWorkspace && (
              <Tabs
                value={interviewFlowType}
                onValueChange={handleInterviewFlowTypeChange}
              >
                <TabsList className="h-9 max-w-full flex-nowrap justify-start overflow-x-auto overflow-y-hidden whitespace-nowrap [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:w-fit">
                  {interviewTypeTabs.map((tab) => (
                    <TabsTrigger
                      key={tab.value}
                      value={tab.value}
                    >
                      {tab.label}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
            )}
            <div className="flex flex-col gap-1">
              <p className="text-sm font-medium">选择流程</p>
              <p className="text-xs text-muted-foreground">
                切换流程后，下方列表会自动刷新对应报名人员。
              </p>
            </div>
          </div>
          <SelectFlow
            flowTypes={visibleFlowTypes}
            defaultFlowTypeId={flowId}
            onChange={handleFlowChange}
          />
        </div>

        {/* Interview totals live in the 全部 chip and the row list, so repeating
            总人数 and 流程类型 here only added a third copy of the same numbers. */}
        {!isEvaluationWorkspace && flowId && !loading && !loadError && (
          <div className="flex flex-wrap gap-x-6 gap-y-2 border-t px-4 py-2.5 text-sm">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Users className="size-4" />
              <span>总人数</span>
              <span className="font-semibold tabular-nums text-foreground">
                {safeScoreData.length}
              </span>
            </div>
            <div className="flex items-center gap-2 text-muted-foreground">
              <BadgeCheck className="size-4" />
              <span>平均分</span>
              <span className="font-semibold tabular-nums text-foreground">
                {averageScore.toFixed(2)}
              </span>
            </div>
            <div className="flex items-center gap-2 text-muted-foreground">
              <ClipboardList className="size-4" />
              <span>流程类型</span>
              <span className="font-medium text-foreground">笔试成绩</span>
            </div>
          </div>
        )}
      </section>

      {!flowId ? (
        <div className="rounded-lg border bg-card p-8 text-center text-sm text-muted-foreground">
          暂无流程
        </div>
      ) : isEvaluationWorkspace ? (
        <div className="space-y-4">
          {role >= 3 && !loadError && (
            <ResultPublicationPanel
              key={`${flowId}-${publicationRefreshKey}`}
              flowId={Number(flowId)}
              onStatusChange={handlePublicationStatusChange}
            />
          )}
          {loadError ? (
            errorPanel
          ) : (
            <EvaluationTable
              candidates={safeEvalData}
              groupOptions={currentFlowGroupOptions}
              role={role}
              targetUserFlowId={targetUserFlowId}
              targetScheduleId={targetScheduleId}
              loading={loading}
              onRefresh={refreshEvalDataAndPublication}
            />
          )}
        </div>
      ) : loading ? (
        <Loading />
      ) : (
        <div className="space-y-4">
          {role >= 3 && !loadError && (
            <ResultPublicationPanel
              key={`${flowId}-${publicationRefreshKey}`}
              flowId={Number(flowId)}
              onStatusChange={handlePublicationStatusChange}
            />
          )}
          {loadError ? (
            errorPanel
          ) : (
            <DataTable
              columns={makeColumns(role)}
              data={safeScoreData}
              flowTypeId={parseInt(flowId)}
              targetUserFlowId={targetUserFlowId}
              role={role}
              onOutcomeChanged={() => setPublicationRefreshKey((value) => value + 1)}
              resultsLocked={publicationStatus === 'published' || publicationStatus === 'publishing'}
            />
          )}
        </div>
      )}
    </div>
  );
};
