'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle } from 'lucide-react';
import { SelectFlow } from '@/components/recruitment/selectFlow';
import { DataTable } from '@/components/recruitment/table';
import { EvaluationTable } from '@/components/recruitment/evaluationTable';
import { PendingSlotChangePanel } from '@/components/recruitment/pendingSlotChangePanel';
import { makeColumns } from '@/components/recruitment/columns';
import { calScore } from '@/action/user-flow/user-point/calScore';
import { getEvaluationCandidates } from '@/action/user-flow/evaluation';
import {
  listPendingSlotChangeRequests,
  type PendingSlotChangeRow,
} from '@/action/user-flow/interview-slot-change';
import { flowTypeLabel, isOfficeInterviewFlow } from '@/const/flow';
import { Loading } from '@/components/loading';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { flowSelection } from '@/types/flow';
import { BadgeCheck, ClipboardList, Users } from 'lucide-react';
import { toast } from 'sonner';
import { ResultPublicationPanel } from '@/components/recruitment/ResultPublicationPanel';
import {
  OfficeRosterDialog,
  type OfficeRosterRow,
} from '@/components/recruitment/officeRosterDialog';
import { closeOfficeRoundOne } from '@/action/user-flow/office-rounds';

type ExamResult = Awaited<ReturnType<typeof calScore>>;
type CandidatesResult = Awaited<ReturnType<typeof getEvaluationCandidates>>;
type RecruitmentWorkspaceMode = 'written' | 'interview';

/* 面试工作台的流程类型页签（名称按流程归属部门生成：软件研发部WOC / 多媒体部WOD …） */
const interviewTypeValues = [
  'recruitment_exemption',
  'woc',
  'soc',
  'office_interview',
] as const;

type InterviewFlowType = (typeof interviewTypeValues)[number];

/**
 * A failed load must never look like an empty flow, so the panel states the
 * failure and offers a retry instead of falling through to the empty copy.
 */
const LOAD_ERROR_MESSAGE = '无法加载该流程的候选人，请检查网络后重试。';

function getInterviewFlowType(flowTypes: flowSelection[], flowId?: string) {
  const type = flowTypes.find((flow) => flow.id === Number(flowId))?.type;
  const matched = interviewTypeValues.find((value) => value === type);
  return matched ?? interviewTypeValues[0];
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
  const [pendingSlotRows, setPendingSlotRows] = useState<
    PendingSlotChangeRow[]
  >([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [publicationRefreshKey, setPublicationRefreshKey] = useState(0);
  const [publicationStatus, setPublicationStatus] = useState<string | null>(null);
  /* 办公类一体流程：结束一面时的名单确认状态（逐人通过/不通过 + 模板核对） */
  const [roundOneDialogOpen, setRoundOneDialogOpen] = useState(false);
  const [closingRoundOne, setClosingRoundOne] = useState(false);
  const [roundOneDecisions, setRoundOneDecisions] = useState<
    Record<number, boolean>
  >({});
  const [roundOneTemplateConfirmed, setRoundOneTemplateConfirmed] =
    useState(false);
  const flowRequestId = useRef(0);
  const safeFlowTypes = Array.isArray(flowTypes) ? flowTypes : [];
  const safeScoreData = Array.isArray(scoreData) ? scoreData : [];
  const safeEvalData = Array.isArray(evalData) ? evalData : [];
  const currentFlowGroupOptions =
    safeFlowTypes.find((flow) => flow.id === Number(flowId))?.groupOptions ?? [];
  /* 办公类面试在面评里打分，其他流程保持原来的面评表单 */
  const scoringEnabled = isOfficeInterviewFlow(
    safeFlowTypes.find((flow) => flow.id === Number(flowId))?.type ?? '',
  );

  const isEvaluationWorkspace = mode === 'interview';
  const [interviewFlowType, setInterviewFlowType] = useState<InterviewFlowType>(
    () => getInterviewFlowType(safeFlowTypes, defaultFlowId),
  );
  const visibleFlowTypes = isEvaluationWorkspace
    ? safeFlowTypes.filter((flow) => flow.type === interviewFlowType)
    : safeFlowTypes;

  /* 改期申请按所选流程加载：审批列表只显示当前流程的申请，不串到别的流程 */
  useEffect(() => {
    if (!isEvaluationWorkspace || !flowId) {
      setPendingSlotRows([]);
      return;
    }
    let cancelled = false;
    listPendingSlotChangeRequests(Number(flowId))
      .then((rows) => {
        if (!cancelled) setPendingSlotRows(Array.isArray(rows) ? rows : []);
      })
      .catch(() => {
        if (!cancelled) setPendingSlotRows([]);
      });
    return () => {
      cancelled = true;
    };
  }, [flowId, isEvaluationWorkspace]);

  /* 页签名称按流程归属部门生成（软件研发部WOC / 多媒体部WOD …） */
  const interviewTabs = interviewTypeValues.map((value) => ({
    value,
    label: flowTypeLabel(
      value,
      safeFlowTypes.find((flow) => flow.type === value)?.department ?? null,
    ),
  }));

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

  /* 结束一面：部长在名单弹窗里逐人确认结果，确认即归档并发一面结果通知；只对办公类流程开放 */
  const canCloseRoundOne =
    isEvaluationWorkspace && scoringEnabled && role >= 3 && Boolean(flowId) && !loadError;
  const currentFlowTitle =
    safeFlowTypes.find((flow) => flow.id === Number(flowId))?.title ?? '';
  /* 名单来源：本流程「一面进行中」的候选人（列表接口已排除撤回者） */
  const roundOneRoster: OfficeRosterRow[] = safeEvalData
    .filter((candidate) => candidate.status === 'ongoing' && candidate.round === 1)
    .map((candidate) => ({
      userFlowId: candidate.userFlowId,
      name: candidate.name,
      studentId: candidate.studentId,
      choice: candidate.choice,
      siblingDepartment: candidate.siblingDepartment,
      /* 一面记录：该候选人 round=1 的面评分数（办公类必填 0-100） */
      scores: candidate.evaluations
        .filter(
          (evaluation) => evaluation.round === 1 && evaluation.score !== null,
        )
        .map((evaluation) => evaluation.score as number),
      /* 一面不涉及最终去向，也不发送结果邮件，这两列由组件按 mode 省略 */
      officeChoices: [],
      finalDepartment: null,
    }));

  const openRoundOneDialog = () => {
    /* 每次打开都按当前名单重建默认结论：全部通过、邮件模板未核对 */
    setRoundOneDecisions(
      Object.fromEntries(roundOneRoster.map((row) => [row.userFlowId, true])),
    );
    setRoundOneTemplateConfirmed(false);
    setRoundOneDialogOpen(true);
  };

  const handleRoundOneDecisionChange = (userFlowId: number, passed: boolean) => {
    setRoundOneDecisions((current) => ({ ...current, [userFlowId]: passed }));
  };

  const handleRoundOneSetAll = (passed: boolean) => {
    setRoundOneDecisions(
      Object.fromEntries(roundOneRoster.map((row) => [row.userFlowId, passed])),
    );
  };

  const confirmRoundOne = async () => {
    if (!flowId) return;
    setClosingRoundOne(true);
    try {
      const result = await closeOfficeRoundOne(
        Number(flowId),
        roundOneRoster.map((row) => ({
          userFlowId: row.userFlowId,
          passed: roundOneDecisions[row.userFlowId] !== false,
        })),
        roundOneTemplateConfirmed,
      );
      if (!result.success) {
        toast.error(result.error.message);
        return;
      }
      setRoundOneDialogOpen(false);
      toast.success(
        `一面名单已确认：通过 ${result.passCount} 人 · 未通过 ${result.rejectCount} 人`,
      );
      if (result.emailWarning) toast.warning(result.emailWarning);
      await refreshEvalData();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : '结束一面失败，请稍后重试',
      );
    } finally {
      setClosingRoundOne(false);
    }
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
        {/* The select explains itself; the "选择流程 / 切换后会刷新" copy was two
            lines of chrome above the list. */}
        <div className="flex flex-col gap-3 p-3 lg:flex-row lg:items-center lg:justify-between lg:gap-4">
          {isEvaluationWorkspace && (
            <Tabs
              value={interviewFlowType}
              onValueChange={handleInterviewFlowTypeChange}
            >
              <TabsList className="h-9 max-w-full flex-nowrap justify-start overflow-x-auto overflow-y-hidden whitespace-nowrap [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:w-fit">
                {interviewTabs.map((tab) => (
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
          <SelectFlow
            flowTypes={visibleFlowTypes}
            defaultFlowTypeId={flowId}
            onChange={handleFlowChange}
          />

          {canCloseRoundOne && (
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-10 shrink-0 lg:h-8"
                onClick={openRoundOneDialog}
              >
                结束一面并发送通知
              </Button>
              <OfficeRosterDialog
                open={roundOneDialogOpen}
                onOpenChange={(next) => {
                  if (!closingRoundOne) setRoundOneDialogOpen(next);
                }}
                mode="round1"
                flowTitle={currentFlowTitle}
                rows={roundOneRoster}
                decisions={roundOneDecisions}
                onDecisionChange={handleRoundOneDecisionChange}
                onSetAll={handleRoundOneSetAll}
                templateConfirmed={roundOneTemplateConfirmed}
                onTemplateConfirmedChange={setRoundOneTemplateConfirmed}
                submitting={closingRoundOne}
                onConfirm={() => void confirmRoundOne()}
              />
            </>
          )}

          {/* Written mode only, and on the same line as the selector: with the
              heading gone, a separate row left the card half empty. Interview
              totals live in the 全部 chip instead of here. */}
          {!isEvaluationWorkspace && flowId && !loading && !loadError && (
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
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
        </div>
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
              scoringEnabled={scoringEnabled}
              onRefresh={refreshEvalDataAndPublication}
            />
          )}
          <PendingSlotChangePanel rows={pendingSlotRows} />
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
