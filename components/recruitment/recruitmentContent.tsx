'use client';

import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
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
  OFFICE_INTERVIEW_FLOW_TYPE,
  SEMANTIC_FLOW_TYPE_OPTIONS,
  flowStageLabel,
  flowTypeLabel,
  flowTypeOptionOf,
  flowTypeOptionValue,
  isOfficeInterviewFlow,
} from '@/const/flow';
import { departmentKey, departmentLabel } from '@/const/department';
import { writeWorkspaceFlowPreference } from '@/lib/workspace-flow-preference';
import { cn } from '@/lib/utils';
import { Loading } from '@/components/loading';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { flowSelection } from '@/types/flow';
import { BadgeCheck, ClipboardList, Download, Users } from 'lucide-react';
import { toast } from 'sonner';
import { ResultPublicationPanel } from '@/components/recruitment/ResultPublicationPanel';
import { OfficeRoundOneRosterDialog } from '@/components/recruitment/officeRoundOneRosterDialog';
import { buildOfficeRoundOneRoster } from '@/lib/office-round-one-roster';
import {
  OfficeRosterDialog,
  type OfficeRosterRow,
} from '@/components/recruitment/officeRosterDialog';
import { OfficeRecordDialog } from '@/components/recruitment/officeRecordDialog';
import { closeOfficeRoundOne } from '@/action/user-flow/office-rounds';

type ExamResult = Awaited<ReturnType<typeof calScore>>;
type CandidatesResult = Awaited<ReturnType<typeof getEvaluationCandidates>>;
type RecruitmentWorkspaceMode = 'written' | 'interview';

/**
 * 投递部门只在没被流程归属隐含时才显示：部门自有流程下所有候选人都归同一个部门
 * （页签与流程名已经写了），共享流程（流程无归属）或候选人与流程归属不一致时才需要逐行标出。
 */
const showsAppliedDepartment = (
  rows: Array<{ department: string | null }>,
  flowDepartment: string | null,
) => rows.some((row) => (row.department ?? null) !== flowDepartment);

/* 面试工作台的页签 = 部门 × 阶段的语义组合（软件研发部免试 / 多媒体部WOD / 办公室面试 …） */
type InterviewFlowGroup = {
  /* 组合值：`部门:阶段`（flowTypeOptionValue），页签与选中态都用它 */
  value: string;
  label: string;
  /* 页签上真正显示的文字：同部门有多个阶段时只用阶段名，部门名提到页签栏的部门标题上 */
  displayLabel: string;
  /* 只含阶段的短名（免试 / WOC / 面试）；非标准组合为 null */
  stageLabel: string | null;
  /* 组合所属部门（Link 标识）；非标准组合为 null */
  department: string | null;
  /* 该组合下的流程，沿用服务端顺序（createdAt 倒序），首条即最新的流程 */
  flows: flowSelection[];
};

/** 页签栏里同一部门的连续组合（顺序沿用语义顺序，同一部门天然相邻） */
type InterviewFlowGroupBucket = {
  department: string | null;
  groups: InterviewFlowGroup[];
};

function buildInterviewFlowGroupBuckets(
  groups: InterviewFlowGroup[],
): InterviewFlowGroupBucket[] {
  const buckets: InterviewFlowGroupBucket[] = [];
  groups.forEach((group) => {
    const last = buckets[buckets.length - 1];
    if (last && last.department === group.department) {
      last.groups.push(group);
      return;
    }
    buckets.push({ department: group.department, groups: [group] });
  });
  return buckets;
}

/**
 * 这一组页签是否把部门名从页签文字里摘出来、由分组标题统一写一次。
 * 条件：同部门有多个阶段，且每个阶段都能给出只含阶段的名字
 * （非标准组合没有语义阶段名，就只能继续用完整名，否则页签会变成光秃秃的一个字）。
 */
function bucketUsesStageOnlyLabel(bucket: InterviewFlowGroupBucket) {
  return (
    bucket.groups.length > 1 &&
    Boolean(bucket.department) &&
    bucket.groups.every(
      (group) => group.stageLabel && group.stageLabel !== group.label,
    )
  );
}

/**
 * 页签只保留实际存在流程的组合，顺序按 SEMANTIC_FLOW_TYPE_OPTIONS：
 * 部门清单由 Link 维护，语义组合是产品口径，两个顺序混在一起会出现「免试排在WOC后面」这类噪音。
 *
 * 页签文字在「同部门有多个阶段」时只留阶段名（软件研发部 免试/WOC/SOC），
 * 部门名作为分组标题写一次——否则 12 个组合每个都重复一遍部门名，页签栏必然要横滚。
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
    const label = option?.label ?? flowTypeLabel(flow.type, flow.department);
    groups.set(value, {
      value,
      label,
      displayLabel: label,
      /* 阶段短名直接按 (类型, 部门) 算：Link 新增部门（电子部）没有语义选项，
         但它在页签上照样该显示「电子部 免试/WOC/SOC」而不是把部门名重复三遍 */
      stageLabel: flowStageLabel(flow.type, flow.department),
      department: option?.department ?? departmentKey(flow.department) ?? null,
      flows: [flow],
    });
  });
  const semanticOrder = new Map(
    SEMANTIC_FLOW_TYPE_OPTIONS.map((option, index) => [option.value, index]),
  );
  /* 非标准组合（历史遗留 / Link 新增部门）没有语义序号，退一步按阶段本身的先后排：
     否则同一个部门下会按流程创建时间倒着排成 SOC / WOC / 免试。 */
  const stageOrder = new Map(
    [
      'recruitment_exemption',
      'recruitment',
      'woc',
      'soc',
      OFFICE_INTERVIEW_FLOW_TYPE,
    ].map((type, index) => [type, index]),
  );
  const stageIndexOf = (value: string) => {
    const separator = value.indexOf(':');
    return stageOrder.get(value.slice(separator + 1)) ?? Number.MAX_SAFE_INTEGER;
  };
  /* sort 稳定：同序组合保持流程原顺序 */
  const ordered = [...groups.values()].sort(
    (a, b) =>
      (semanticOrder.get(a.value) ?? Number.MAX_SAFE_INTEGER) -
        (semanticOrder.get(b.value) ?? Number.MAX_SAFE_INTEGER) ||
      stageIndexOf(a.value) - stageIndexOf(b.value),
  );
  buildInterviewFlowGroupBuckets(ordered).forEach((bucket) => {
    if (!bucketUsesStageOnlyLabel(bucket)) return;
    bucket.groups.forEach((group) => {
      group.displayLabel = group.stageLabel ?? group.label;
    });
  });
  return ordered;
}

/**
 * 横向滚动容器的两端溢出状态。
 * 页签栏里的原生滚动条又粗又抢眼，改成隐藏滚动条 + 两端渐隐提示还能继续滑。
 * `revision` 变化（页签增减、切部门）时重新量一次：ResizeObserver 只看盒子大小。
 */
function useEdgeFade<T extends HTMLElement>(revision: string) {
  const ref = useRef<T>(null);
  const [edges, setEdges] = useState({ start: false, end: false });

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const update = () => {
      const start = node.scrollLeft > 2;
      const end = node.scrollWidth - node.clientWidth - node.scrollLeft > 2;
      setEdges((previous) =>
        previous.start === start && previous.end === end
          ? previous
          : { start, end },
      );
    };
    update();
    node.addEventListener('scroll', update, { passive: true });
    const observer =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update);
    observer?.observe(node);
    return () => {
      node.removeEventListener('scroll', update);
      observer?.disconnect();
    };
  }, [revision]);

  return { ref, edges };
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
  const [roundOneRosterOpen, setRoundOneRosterOpen] = useState(false);
  /* 一面名单确认时勾选「邮件」的候选人：默认全部，未勾选者只写结果不发通知 */
  const [roundOneNotifyUserFlowIds, setRoundOneNotifyUserFlowIds] = useState<
    number[]
  >([]);
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
    /* 记住这次点选的流程：下次打开工作台（面试/笔试管理）默认回到它 */
    writeWorkspaceFlowPreference(mode, Number(value));
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

  /* 结束一面：名单里有进行中的一面候选人才需要确认；确认过一面后入口换成查看/导出名单 */
  const roundOneToolbarVisible =
    isEvaluationWorkspace &&
    scoringEnabled &&
    role >= 3 &&
    officeRoundView === 1 &&
    Boolean(flowId) &&
    !loadError;
  const currentFlowTitle =
    safeFlowTypes.find((flow) => flow.id === Number(flowId))?.title ?? '';
  /* 名单确认弹窗里的「打开邮件模板页核对」：直接落到本部门的模板板块 */
  const currentFlowDepartment = departmentKey(
    safeFlowTypes.find((flow) => flow.id === Number(flowId))?.department,
  );
  const templateHref = currentFlowDepartment
    ? `/dashboard/emails?tab=templates&department=${encodeURIComponent(currentFlowDepartment)}`
    : '/dashboard/emails?tab=templates';
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

  /* 一面已确认：没有进行中的一面候选人，但已经有了一面结论（进入二面或止步一面） */
  const roundOneRosterRows = buildOfficeRoundOneRoster(safeEvalData);
  const roundOneConfirmed =
    roundOneRoster.length === 0 && roundOneRosterRows.length > 0;
  const canCloseRoundOne = roundOneToolbarVisible && roundOneRoster.length > 0;
  const canReviewRoundOneRoster = roundOneToolbarVisible && roundOneConfirmed;

  const openRoundOneDialog = () => {
    /* 每次打开都按当前名单重建默认结论与勾选：全部通过、全部发邮件、模板未核对 */
    setRoundOneDecisions(
      Object.fromEntries(roundOneRoster.map((row) => [row.userFlowId, true])),
    );
    setRoundOneNotifyUserFlowIds(roundOneRoster.map((row) => row.userFlowId));
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
        roundOneNotifyUserFlowIds,
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

  /* 页签栏按部门分组：同部门有多个阶段时部门名只写一次（软件研发部 免试/WOC/SOC），
     页签文字只留阶段；只有一个阶段的部门保留完整名（办公室面试），不必回头找分组标题。 */
  const flowGroupBuckets = buildInterviewFlowGroupBuckets(interviewFlowGroups);
  /* revision = 页签组合的指纹：组合或它们的文字变了就重新量一次滚动溢出 */
  const { ref: flowTabListRef, edges: flowTabEdges } =
    useEdgeFade<HTMLDivElement>(
      interviewFlowGroups
        .map((group) => `${group.value}:${group.displayLabel}`)
        .join('|'),
    );

  return (
    <div className="min-w-0 space-y-4">
      <section className="overflow-hidden rounded-lg border bg-card">
        {isEvaluationWorkspace && interviewFlowGroups.length > 0 && (
          <div className="relative border-b">
            {/* 语义化页签可能有很多（12 个部门×阶段），行内收缩并横滑；原生滚动条在页签栏里
                很丑，用两端渐隐提示还能继续滑（min-w-0 才能让 flex 子项真的缩下去） */}
            <Tabs
              className="min-w-0 max-w-full px-3 sm:px-4"
              value={activeGroupValue ?? undefined}
              onValueChange={handleFlowGroupChange}
            >
              <TabsList
                ref={flowTabListRef}
                variant="line"
                className="h-10 w-full max-w-full flex-nowrap justify-start gap-0.5 overflow-x-auto overflow-y-hidden whitespace-nowrap [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [&_[data-slot=tabs-trigger]]:flex-none [&_[data-slot=tabs-trigger]]:px-2.5 [&_[data-slot=tabs-trigger]]:after:h-[2px] [&_[data-slot=tabs-trigger]]:after:bg-primary [&_[data-slot=tabs-trigger][data-state=active]]:font-semibold [&_[data-slot=tabs-trigger][data-state=active]]:text-foreground"
              >
                {flowGroupBuckets.map((bucket, index) => (
                  <Fragment key={bucket.department ?? `fallback-${index}`}>
                    {index > 0 && (
                      <span
                        aria-hidden="true"
                        className="mx-1.5 h-3.5 w-px shrink-0 self-center bg-border"
                      />
                    )}
                    {bucketUsesStageOnlyLabel(bucket) && (
                      <span className="shrink-0 self-center pl-1 pr-1 text-[11px] font-normal tracking-wide text-muted-foreground/70">
                        {departmentLabel(bucket.department)}
                      </span>
                    )}
                    {bucket.groups.map((group) => (
                      <TabsTrigger key={group.value} value={group.value}>
                        {group.displayLabel}
                      </TabsTrigger>
                    ))}
                  </Fragment>
                ))}
              </TabsList>
            </Tabs>
            {flowTabEdges.start && (
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-y-0 left-0 w-6 bg-gradient-to-r from-card to-transparent"
              />
            )}
            {flowTabEdges.end && (
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-y-0 right-0 w-6 bg-gradient-to-l from-card to-transparent"
              />
            )}
          </div>
        )}

        {/* 流程选择器与轮次切换同一行：办公类选完流程紧接着就要选一面/二面 */}
        <div className="flex flex-col gap-3 p-3 lg:flex-row lg:items-center lg:justify-between lg:gap-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-2.5">
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
                className="inline-flex h-10 shrink-0 items-center self-start rounded-lg border bg-muted/40 p-0.5 sm:h-9"
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

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-2.5">
            {/* Written mode: totals sit next to the selector instead of on their own row */}
            {!isEvaluationWorkspace && flowId && !loading && !loadError && (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
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
              </div>
            )}

            {canCloseRoundOne && (
              <>
                <Button
                  type="button"
                  size="sm"
                  className="h-10 shrink-0 sm:h-9"
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
                  templateHref={templateHref}
                  notifyUserFlowIds={roundOneNotifyUserFlowIds}
                  onNotifyUserFlowIdsChange={setRoundOneNotifyUserFlowIds}
                  submitting={closingRoundOne}
                  onConfirm={() => void confirmRoundOne()}
                />
              </>
            )}
            {/* 一面确认后入口换成名单回看与导出：结束一面的动作不再可点（重发通知走邮件中心） */}
            {canReviewRoundOneRoster && (
              <>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-10 shrink-0 sm:h-9"
                  onClick={() => setRoundOneRosterOpen(true)}
                >
                  <ClipboardList data-icon="inline-start" />
                  查看一面名单
                </Button>
                <Button
                  asChild
                  size="sm"
                  variant="outline"
                  className="h-10 shrink-0 sm:h-9"
                >
                  <a href={`/api/flow/office-round-one-export?flowId=${flowId}`}>
                    <Download data-icon="inline-start" />
                    导出一面名单
                  </a>
                </Button>
              </>
            )}
          </div>
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
              flowId={Number(flowId)}
              candidates={safeEvalData}
              groupOptions={currentFlowGroupOptions}
              role={role}
              targetUserFlowId={targetUserFlowId}
              targetScheduleId={targetScheduleId}
              loading={loading}
              scoringEnabled={scoringEnabled}
              roundView={scoringEnabled ? officeRoundView : null}
              slotOptions={currentFlowSlotOptions}
              showDepartment={showsAppliedDepartment(safeEvalData, currentFlowDepartment)}
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
          {/* 一面确认后的名单回看：与「导出一面名单」同一份推导（进入二面 / 止步一面） */}
          {scoringEnabled && (
            <OfficeRoundOneRosterDialog
              open={roundOneRosterOpen}
              onOpenChange={setRoundOneRosterOpen}
              flowTitle={currentFlowTitle}
              candidates={safeEvalData}
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
              columns={makeColumns(role, {
                showDepartment: showsAppliedDepartment(
                  safeScoreData,
                  currentFlowDepartment,
                ),
              })}
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
