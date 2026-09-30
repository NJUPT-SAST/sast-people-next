'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import {
  SEMANTIC_FLOW_TYPE_OPTIONS,
  flowTypeLabel,
  flowTypeOptionOf,
  flowTypeOptionValue,
  isOfficeInterviewFlow,
} from '@/const/flow';
import { departmentKey } from '@/const/department';
import { cn } from '@/lib/utils';
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
import { OfficeRecordDialog } from '@/components/recruitment/officeRecordDialog';
import { closeOfficeRoundOne } from '@/action/user-flow/office-rounds';

type ExamResult = Awaited<ReturnType<typeof calScore>>;
type CandidatesResult = Awaited<ReturnType<typeof getEvaluationCandidates>>;
type RecruitmentWorkspaceMode = 'written' | 'interview';

/* 面试工作台的页签 = 部门 × 阶段的语义组合（软件研发部免试 / 多媒体部WOD / 办公室面试 …） */
type InterviewFlowGroup = {
  /* 组合值：`部门:阶段`（flowTypeOptionValue），页签与选中态都用它 */
  value: string;
  label: string;
  /* 该组合下的流程，沿用服务端顺序（createdAt 倒序），首条即最新的流程 */
  flows: flowSelection[];
};

/**
 * 页签只保留实际存在流程的组合，顺序按 SEMANTIC_FLOW_TYPE_OPTIONS：
 * 部门清单由 Link 维护，语义组合是产品口径，两个顺序混在一起会出现「免试排在WOC后面」这类噪音。
 */
function buildInterviewFlowGroups(
  flowTypes: flowSelection[],
): InterviewFlowGroup[] {
  const groups = new Map<string, InterviewFlowGroup>();
  flowTypes.forEach((flow) => {
    const option = flowTypeOptionOf(flow.type, flow.department);
    const value =
      option?.value ??
      flowTypeOptionValue(flow.type, departmentKey(flow.department) ?? '');
    const existing = groups.get(value);
    if (existing) {
      existing.flows.push(flow);
      return;
    }
    groups.set(value, {
      value,
      label: option?.label ?? flowTypeLabel(flow.type, flow.department),
      flows: [flow],
    });
  });
  const semanticOrder = new Map(
    SEMANTIC_FLOW_TYPE_OPTIONS.map((option, index) => [option.value, index]),
  );
  /* 非标准组合（历史遗留）排在语义组合之后；sort 稳定，同序组合保持流程原顺序 */
  return [...groups.values()].sort(
    (a, b) =>
      (semanticOrder.get(a.value) ?? Number.MAX_SAFE_INTEGER) -
      (semanticOrder.get(b.value) ?? Number.MAX_SAFE_INTEGER),
  );
}

/**
 * A failed load must never look like an empty flow, so the panel states the
 * failure and offers a retry instead of falling through to the empty copy.
 */
const LOAD_ERROR_MESSAGE = '无法加载该流程的候选人，请检查网络后重试。';

/**
 * 轮次视图默认值：一面的人确认完后列表只剩二面候选人，默认就该落在二面；
 * 空流程（两面都没有人）保持一面，沿用「暂无待面试的候选人」这条空状态。
 */
function defaultOfficeRoundView(candidates: CandidatesResult): 1 | 2 {
  const hasRoundOne = candidates.some((candidate) => candidate.round === 1);
  if (hasRoundOne) return 1;
  return candidates.some((candidate) => candidate.round === 2) ? 2 : 1;
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
  /* 办公类轮次视图：一面看单人最终分+时段，二面看多位部长均分（无时段） */
  const [officeRoundView, setOfficeRoundView] = useState<1 | 2>(() =>
    defaultOfficeRoundView(initialEvalData),
  );
  /* 页签选中的语义组合；null = 跟随当前流程所在组合 */
  const [flowGroupValue, setFlowGroupValue] = useState<string | null>(null);
  /* 打开的「全部面试记录」弹窗对应的候选人 */
  const [recordUserFlowId, setRecordUserFlowId] = useState<number | null>(null);
  const flowRequestId = useRef(0);
  /* 数组回退包进 useMemo：否则 useMemo 依赖每次渲染都会变，等于没缓存 */
  const safeFlowTypes = useMemo(
    () => (Array.isArray(flowTypes) ? flowTypes : []),
    [flowTypes],
  );
  const safeScoreData = useMemo(
    () => (Array.isArray(scoreData) ? scoreData : []),
    [scoreData],
  );
  const safeEvalData = useMemo(
    () => (Array.isArray(evalData) ? evalData : []),
    [evalData],
  );
  const currentFlowGroupOptions =
    safeFlowTypes.find((flow) => flow.id === Number(flowId))?.groupOptions ?? [];
  /* 办公类面试在面评里打分，其他流程保持原来的面评表单 */
  const scoringEnabled = isOfficeInterviewFlow(
    safeFlowTypes.find((flow) => flow.id === Number(flowId))?.type ?? '',
  );
  /* 办公类流程配置的时段选项（label）：行内改时段与时段筛选用 */
  const currentFlowSlotOptions = (
    safeFlowTypes.find((flow) => flow.id === Number(flowId))?.slotOptions ?? []
  ).map((option) => option.label);

  const isEvaluationWorkspace = mode === 'interview';
  /* 页签组合：只保留有流程的「部门 × 阶段」，无流程时不渲染页签 */
  const interviewFlowGroups = useMemo(
    () =>
      isEvaluationWorkspace ? buildInterviewFlowGroups(safeFlowTypes) : [],
    [isEvaluationWorkspace, safeFlowTypes],
  );
  /* 默认页签 = 当前流程所在组合，否则第一个组合（切流程时页签跟着走） */
  const fallbackGroupValue = useMemo(() => {
    const currentFlow = safeFlowTypes.find((flow) => flow.id === Number(flowId));
    const ownGroup = currentFlow
      ? interviewFlowGroups.find((group) =>
          group.flows.some((flow) => flow.id === currentFlow.id),
        )
      : undefined;
    return ownGroup?.value ?? interviewFlowGroups[0]?.value ?? null;
  }, [flowId, interviewFlowGroups, safeFlowTypes]);
  const activeGroupValue =
    flowGroupValue &&
    interviewFlowGroups.some((group) => group.value === flowGroupValue)
      ? flowGroupValue
      : fallbackGroupValue;
  const activeGroup =
    interviewFlowGroups.find((group) => group.value === activeGroupValue) ??
    null;
  const visibleFlowTypes = isEvaluationWorkspace
    ? (activeGroup?.flows ?? [])
    : safeFlowTypes;
  /* 办公类轮次人数：分段控件上的计数，数据来自当前流程的候选人 */
  const officeRoundCounts = useMemo(() => {
    let one = 0;
    let two = 0;
    safeEvalData.forEach((candidate) => {
      if (candidate.round === 1) one += 1;
      else if (candidate.round === 2) two += 1;
    });
    return { one, two };
  }, [safeEvalData]);

  /* 改期审批已从办公类下线：待审批列表只给技术流程加载，避免无意义请求 */
  useEffect(() => {
    if (!isEvaluationWorkspace || !flowId || scoringEnabled) {
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
  }, [flowId, isEvaluationWorkspace, scoringEnabled]);

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
          /* 换流程后轮次视图重新定：新流程可能只有一面或只有二面的人 */
          setOfficeRoundView(defaultOfficeRoundView(candidates));
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

  /* 页签切组合：选中该组合下最新的一条流程（列表按 createdAt 倒序）并加载 */
  const handleFlowGroupChange = async (value: string) => {
    setFlowGroupValue(value);
    const nextFlow = interviewFlowGroups.find(
      (group) => group.value === value,
    )?.flows[0];
    if (!nextFlow) {
      /* 组合下没有流程（理论上不会发生）：清空当前列表，别留着上一条流程的数据 */
      ++flowRequestId.current;
      setFlowId(undefined);
      setLoading(false);
      setEvalData([]);
      setLoadError(null);
      return;
    }
    await handleFlowChange(nextFlow.id.toString());
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
    isEvaluationWorkspace &&
    scoringEnabled &&
    role >= 3 &&
    officeRoundView === 1 &&
    Boolean(flowId) &&
    !loadError;
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
      /* 有人通过就说明名单已推进到二面：直接把视图切过去，省一次手动切换 */
      if (result.passCount > 0) setOfficeRoundView(2);
      await refreshEvalData();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : '结束一面失败，请稍后重试',
      );
    } finally {
      setClosingRoundOne(false);
    }
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
          {isEvaluationWorkspace && interviewFlowGroups.length > 0 && (
            <Tabs
              /* 语义化页签可能有很多（12 个部门×阶段），必须允许在行内收缩并横滚，
                 否则整页会被撑出横向滚动条（min-w-0 才能让 flex 子项真的缩下去） */
              className="min-w-0 max-w-full"
              value={activeGroupValue ?? undefined}
              onValueChange={handleFlowGroupChange}
            >
              <TabsList className="h-9 w-full max-w-full flex-nowrap justify-start overflow-x-auto overflow-y-hidden whitespace-nowrap [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:w-fit">
                {interviewFlowGroups.map((group) => (
                  <TabsTrigger
                    key={group.value}
                    value={group.value}
                  >
                    {group.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          )}
          {/* 流程选择器与轮次切换同一行：办公类选完流程紧接着就要选一面/二面 */}
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
            <SelectFlow
              flowTypes={visibleFlowTypes}
              defaultFlowTypeId={flowId}
              onChange={handleFlowChange}
            />
            {/* 轮次视图只对办公类开放：技术流程没有轮次，两轮由名单确认收口 */}
            {isEvaluationWorkspace && scoringEnabled && flowId && !loadError && (
              <div
                role="group"
                aria-label="切换面试轮次"
                className="inline-flex h-10 shrink-0 items-center rounded-lg border bg-muted/40 p-0.5 lg:h-8"
              >
                {([1, 2] as const).map((round) => (
                  <button
                    key={round}
                    type="button"
                    aria-pressed={officeRoundView === round}
                    onClick={() => setOfficeRoundView(round)}
                    className={cn(
                      'inline-flex h-full touch-manipulation items-center gap-1 rounded-md px-3 text-xs font-medium whitespace-nowrap outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50',
                      officeRoundView === round
                        ? 'bg-background text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {round === 1 ? '一面' : '二面'}{' '}
                    <span className="tabular-nums opacity-70">
                      {round === 1 ? officeRoundCounts.one : officeRoundCounts.two}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {canCloseRoundOne && (
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-10 shrink-0 lg:h-8"
                onClick={openRoundOneDialog}
                /* 名单空时仍可打开：邮件队列失败后要能再次确认以补发未发送的通知 */
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
          {/* 办公类的结果发布只属于二面：一面还在收人，发布按钮放出来只会被误点 */}
          {role >= 3 &&
            !loadError &&
            (!scoringEnabled || officeRoundView === 2) && (
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
              roundView={scoringEnabled ? officeRoundView : null}
              slotOptions={currentFlowSlotOptions}
              onRefresh={refreshEvalDataAndPublication}
              onOpenRecord={setRecordUserFlowId}
            />
          )}
          {/* 办公类改时段已改为部长在工作台内直接调整：不再展示改期审批面板 */}
          {!scoringEnabled && <PendingSlotChangePanel rows={pendingSlotRows} />}
          {/* 办公类候选人的全部面试记录（一面 + 二面）：行菜单里的入口打开 */}
          {scoringEnabled && (
            <OfficeRecordDialog
              open={recordUserFlowId !== null}
              userFlowId={recordUserFlowId}
              onOpenChange={(open) => {
                if (!open) setRecordUserFlowId(null);
              }}
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
