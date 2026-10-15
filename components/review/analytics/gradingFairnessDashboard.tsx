"use client";

/**
 * 阅卷公平性分析面板（客户端）。
 *
 * 信息层级：结论 → 关键指标 → 讲师宽严（主） + 参数（可调） → 名次变化 → 诊断热力图。
 * 拟合结果由服务端算好（`loadGradingFairnessData`），这里只做两件事：
 *  1. 依据 λ / 人工权重 / 是否保持整体均分，即时重算校正后的分数与名次（O(N)）；
 *  2. 把结果画出来，并允许把参数按流程保存。
 *
 * 该面板**仅供人工参考**：不会写回 `user_point`，也不影响官方成绩。
 */

import { useMemo, useState, useTransition } from "react";
import { Download, Info, Scale, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import type { GradingFairnessData } from "@/action/user-flow/grading-fairness/load";
import {
  saveGradingFairnessProfile,
  type GradingFairnessProfile,
} from "@/action/user-flow/grading-fairness/profile";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { escapeCsv } from "@/lib/csv";
import {
  adjustedRatio,
  buildLeaderboard,
  judgerManualWeight,
  standardizedResidual,
} from "@/lib/grading-fairness/model";
import { cn } from "@/lib/utils";
import type {
  FairnessAdjustmentOptions,
  GradingLeaderboardRow,
  GradingModelFit,
} from "@/lib/grading-fairness/types";

import { JudgerForestPlot } from "./judgerForestPlot";
import { JudgerResidualHeatmap } from "./judgerResidualHeatmap";
import { JudgerShiftChart } from "./judgerShiftChart";
import { JUDGER_VERDICT_META } from "./judgerVerdict";

const VERDICT_ORDER = ["lenient", "fair", "strict", "unknown"] as const;
/** 双侧 95% + 80% 把握对应的系数（用于「能检出多大差异」） */
const DETECTION_FACTOR = 2.8;
/** 结论条的语气 → 图标色 */
type SummaryTone = "unknown" | "found" | "fair";
const TONE_ICON: Record<SummaryTone, string> = {
  unknown: "text-warning",
  found: "text-primary",
  fair: "text-muted-foreground",
};
/** 名次表一次最多渲染多少行（生产流程有 300+ 考生） */
const LEADERBOARD_PAGE_SIZE = 50;

const formatPercent = (ratio: number, digits = 1) => `${(ratio * 100).toFixed(digits)}%`;
const formatPoints = (value: number, digits = 1) => `${value * 100 >= 0 ? "+" : "−"}${Math.abs(value * 100).toFixed(digits)}`;
const formatCredibility = (value: number) => `${Math.round(value * 100)}%`;

const judgerNameOf = (
  judgerLabels: Record<string, string | null>,
  judgerId: number,
) => judgerLabels[String(judgerId)] ?? `讲师 ${judgerId}`;

const candidateNameOf = (
  candidateLabels: Record<string, { name: string | null; studentId: string | null }>,
  userFlowId: number,
) => {
  const label = candidateLabels[String(userFlowId)];
  if (!label) return { name: `考生 ${userFlowId}`, studentId: null };
  return { name: label.name ?? label.studentId ?? `考生 ${userFlowId}`, studentId: label.studentId };
};

const mean = (values: number[]) =>
  values.reduce((total, value) => total + value, 0) / Math.max(values.length, 1);

/** 以当前样本量能可靠检出的宽严差（得分率单位）：2.8·σ̂/√n 的中位数 */
function detectableDifference(fit: GradingModelFit): number | null {
  if (fit.residualSd === null || fit.residualSd <= 0) return null;
  const values = fit.judgers
    .filter((estimate) => estimate.identifiable && estimate.observationCount > 0)
    .map((estimate) => (DETECTION_FACTOR * fit.residualSd!) / Math.sqrt(estimate.observationCount))
    .sort((left, right) => left - right);
  if (values.length === 0) return null;
  return values[Math.floor(values.length / 2)];
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-md border bg-card px-3 py-2">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-base font-semibold tabular-nums">
        {value}
        {hint ? (
          <span className="ml-1 text-xs font-normal text-muted-foreground">（{hint}）</span>
        ) : null}
      </dd>
    </div>
  );
}

export function GradingFairnessDashboard({
  data,
  profile,
}: {
  data: GradingFairnessData;
  profile: GradingFairnessProfile;
}) {
  const { fit, observations, candidateLabels, problemLabels, judgerLabels } = data;
  const [lambda, setLambda] = useState(profile.lambda);
  const [judgerWeights, setJudgerWeights] = useState<Record<string, number>>(
    profile.judgerWeights,
  );
  const [preserveTotal, setPreserveTotal] = useState(true);
  const [isSaving, startSaving] = useTransition();
  /** 名次表视图：全部 / 只看名次变化的考生（生产流程有 300+ 考生） */
  const [leaderboardFilter, setLeaderboardFilter] = useState<"all" | "changed">("all");
  const [showAllRows, setShowAllRows] = useState(false);

  const options: FairnessAdjustmentOptions = useMemo(
    () => ({ lambda, judgerWeights, preserveTotal }),
    [lambda, judgerWeights, preserveTotal],
  );

  const judgerName = (judgerId: number) => judgerNameOf(judgerLabels, judgerId);

  const forestRows = useMemo(
    () =>
      fit.judgers.map((estimate) => ({
        judgerId: estimate.judgerId,
        name: judgerNameOf(judgerLabels, estimate.judgerId),
        bias: estimate.bias,
        standardError: estimate.standardError,
        observationCount: estimate.observationCount,
        credibility: estimate.credibility,
        verdict: estimate.verdict,
      })),
    [fit, judgerLabels],
  );

  const shiftRows = useMemo(
    () =>
      fit.judgers.map((estimate) => {
        const rows = observations.filter((row) => row.judgerId === estimate.judgerId);
        return {
          judgerId: estimate.judgerId,
          name: judgerNameOf(judgerLabels, estimate.judgerId),
          rawMeanRatio: estimate.rawMeanRatio,
          adjustedMeanRatio: mean(rows.map((row) => adjustedRatio(row, fit, options))),
          observationCount: estimate.observationCount,
        };
      }),
    [fit, observations, options, judgerLabels],
  );

  const leaderboard = useMemo(
    () => buildLeaderboard(observations, fit, options),
    [observations, fit, options],
  );

  const conservation = useMemo(() => {
    const rawTotal = leaderboard.reduce((total, row) => total + row.rawPoints, 0);
    const adjustedTotal = leaderboard.reduce((total, row) => total + row.adjustedPoints, 0);
    return adjustedTotal - rawTotal;
  }, [leaderboard]);

  /** 诊断用：残差热力图（与 λ 无关，只依赖拟合结果） */
  const heatmap = useMemo(() => {
    const problemIds = Array.from(new Set(observations.map((row) => row.problemId))).sort(
      (left, right) => left - right,
    );
    const residuals = new Map<string, number[]>();
    for (const row of observations) {
      const residual = standardizedResidual(row, fit);
      if (residual === null) continue;
      const key = `${row.judgerId}:${row.problemId}`;
      const bucket = residuals.get(key);
      if (bucket) bucket.push(residual);
      else residuals.set(key, [residual]);
    }
    return {
      columns: problemIds.map((problemId) => ({
        key: String(problemId),
        label: problemLabels[String(problemId)]?.title ?? `题目 ${problemId}`,
      })),
      rows: fit.judgers.map((estimate) => ({
        key: String(estimate.judgerId),
        label: judgerNameOf(judgerLabels, estimate.judgerId),
        cells: problemIds.map((problemId) => {
          const values = residuals.get(`${estimate.judgerId}:${problemId}`);
          return {
            columnKey: String(problemId),
            value: values && values.length > 0 ? mean(values) : null,
          };
        }),
      })),
    };
  }, [fit, observations, problemLabels, judgerLabels]);

  /** 描述性回退：无法分离宽严时，至少给出每名讲师的原始口径（明确标注不可比较） */
  const descriptiveRows = useMemo(
    () =>
      fit.judgers.map((estimate) => ({
        judgerId: estimate.judgerId,
        name: judgerNameOf(judgerLabels, estimate.judgerId),
        observationCount: estimate.observationCount,
        candidateCount: estimate.candidateCount,
        rawMeanRatio: estimate.rawMeanRatio,
      })),
    [fit, judgerLabels],
  );

  const detectable = useMemo(() => detectableDifference(fit), [fit]);
  const changedCount = leaderboard.filter((row) => row.rankDelta !== 0).length;
  /** 结论条描述的是「λ = 1 时的最大影响」，与当前滑块位置无关 */
  const projectedChangedCount = useMemo(
    () =>
      buildLeaderboard(observations, fit, { ...options, lambda: 1 }).filter(
        (row) => row.rankDelta !== 0,
      ).length,
    [observations, fit, options],
  );
  const deviationEstimates = fit.judgers.filter(
    (estimate) => estimate.identifiable && estimate.verdict !== "fair",
  );
  const hasEstimates = fit.judgers.some((estimate) => estimate.identifiable);
  const canCorrect = fit.judgers.some((estimate) => estimate.bias !== 0);

  const commonMaxPoints = useMemo(() => {
    const maxPoints = new Set(leaderboard.map((row) => row.maxPoints));
    return maxPoints.size === 1 ? [...maxPoints][0] : null;
  }, [leaderboard]);

  const filteredRows = useMemo(
    () =>
      leaderboardFilter === "changed"
        ? leaderboard.filter((row) => row.rankDelta !== 0)
        : leaderboard,
    [leaderboard, leaderboardFilter],
  );
  const visibleRows = useMemo(
    () => (showAllRows ? filteredRows : filteredRows.slice(0, LEADERBOARD_PAGE_SIZE)),
    [filteredRows, showAllRows],
  );

  const exportCsv = () => {
    const header = [
      "名次(原始)",
      "名次(校正)",
      "名次变化",
      "考生",
      "学号",
      "原始分",
      "校正分",
      "满分",
      "原始得分率",
      "校正得分率",
    ];
    const lines = filteredRows.map((row) => {
      const candidate = candidateNameOf(candidateLabels, row.userFlowId);
      return [
        row.rawRank,
        row.adjustedRank,
        row.rankDelta,
        candidate.name,
        candidate.studentId ?? "",
        row.rawPoints,
        row.adjustedPoints,
        row.maxPoints,
        formatPercent(row.rawRatio),
        formatPercent(row.adjustedRatio),
      ]
        .map(escapeCsv)
        .join(",");
    });
    const blob = new Blob([`\uFEFF${[header.join(","), ...lines].join("\n")}`], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${data.flow.title}-阅卷公平性-λ${lambda.toFixed(2)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const savedLambda = profile.lambda;
  const isDirty =
    Math.abs(lambda - savedLambda) > 1e-9 ||
    preserveTotal !== true ||
    JSON.stringify(judgerWeights) !== JSON.stringify(profile.judgerWeights);

  const onSave = () => {
    startSaving(async () => {
      try {
        await saveGradingFairnessProfile({ flowId: data.flow.id, lambda, judgerWeights });
        toast.success("已保存该流程的校正参数");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "保存失败");
      }
    });
  };

  const onReset = () => {
    setLambda(0);
    setJudgerWeights({});
    setPreserveTotal(true);
  };

  const summary = useMemo(() => {
    if (fit.observationCount === 0) {
      return {
        tone: "unknown" as const,
        icon: TriangleAlert,
        title: "本流程没有可分析的评分记录",
        detail:
          data.unattributedCount > 0
            ? `${data.unattributedCount} 条评分没有记录阅卷人（fk_judger_id 为空），无法归属到讲师。`
            : "流程内还没有任何评分。",
      };
    }
    if (!hasEstimates) {
      const single = fit.judgerCount <= 1;
      return {
        tone: "unknown" as const,
        icon: TriangleAlert,
        title: "当前数据无法判定讲师宽严",
        detail: single
          ? `本流程只有 ${fit.judgerCount} 名阅卷人，无法与其他人比较。需要同一名考生被 ≥2 名讲师评过（不同题），或同一道题被 ≥2 名讲师评过（不同考生）。`
          : `本流程有 ${fit.componentCount} 个互不相连的阅卷小组，其中 0 个可判定：宽严只有在讲师之间「评过同一名考生或同一道题」时才可分离。`,
      };
    }
    if (deviationEstimates.length === 0) {
      return {
        tone: "fair" as const,
        icon: Info,
        title: "未检测到讲师之间的系统性差异",
        detail: `讲师间差异 τ = ${(fit.betweenJudgerSd * 100).toFixed(1)}pp，按现有样本量看不出谁偏松谁偏严；校正不会改变任何结果。`,
      };
    }
    const ranked = [...deviationEstimates].sort(
      (left, right) => Math.abs(right.bias) - Math.abs(left.bias),
    );
    const shown = ranked.slice(0, 3);
    const list = shown
      .map(
        (estimate) =>
          `${judgerName(estimate.judgerId)} ${formatPoints(estimate.bias)}pp（${JUDGER_VERDICT_META[estimate.verdict].label}）`,
      )
      .join("、");
    const unknownCount = fit.judgers.filter((estimate) => !estimate.identifiable).length;
    return {
      tone: "found" as const,
      icon: Scale,
      title: `发现 ${deviationEstimates.length} 名讲师的打分系统性偏离同侪：${list}${
        ranked.length > shown.length ? ` 等 ${ranked.length} 名` : ""
      }`,
      detail: [
        unknownCount > 0 ? `另有 ${unknownCount} 名讲师样本不足、未参与判定。` : null,
        `λ = 1 时${
          projectedChangedCount > 0
            ? ` ${projectedChangedCount} 名考生名次变化`
            : "名次没有变化（校正对每名考生的影响一致）"
        }，整体均分不变。`,
        detectable !== null
          ? `按当前样本量可可靠检出约 ${(detectable * 100).toFixed(0)}pp 以上的差异。`
          : null,
      ]
        .filter(Boolean)
        .join(""),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fit, hasEstimates, deviationEstimates, projectedChangedCount, detectable, data.unattributedCount, judgerLabels]);

  return (
    <div className="flex flex-col gap-4 px-4 pb-10 lg:px-6 [&>*]:min-w-0">
      <Card className="min-w-0">
        <CardContent className="flex items-start gap-3 py-4">
          <summary.icon
            aria-hidden
            className={cn("mt-0.5 size-4 shrink-0", TONE_ICON[summary.tone])}
          />
          <div className="flex min-w-0 flex-col gap-1">
            <p className="text-sm font-medium">{summary.title}</p>
            <p className="text-sm leading-relaxed text-muted-foreground">{summary.detail}</p>
          </div>
        </CardContent>
      </Card>

      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="评分观测" value={String(fit.observationCount)} hint={`${fit.candidateCount} 名考生`} />
        <Stat label="题目" value={String(fit.problemCount)} />
        <Stat label="阅卷讲师" value={String(fit.judgerCount)} />
        <Stat
          label="可判定阅卷组"
          value={`${fit.identifiableComponentCount} / ${fit.componentCount}`}
        />
        <Stat label="讲师间差异 τ" value={`${(fit.betweenJudgerSd * 100).toFixed(1)}pp`} />
        <Stat
          label="残差尺度 σ̂"
          value={fit.residualSd === null ? "—" : `${(fit.residualSd * 100).toFixed(1)}pp`}
        />
      </dl>

      {hasEstimates ? (
        <>
          <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_19rem]">
            <Card className="min-w-0">
              <CardHeader>
                <CardTitle className="text-base">讲师宽严（森林图）</CardTitle>
                <CardDescription>
                  点为宽严估计（正 = 偏松），横线是 95% 区间；点越大样本越多，越实心可信度越高。
                  区间很宽说明证据不足，而不是「没问题」。
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <div className="overflow-x-auto">
                  <div className="min-w-[640px]">
                    <JudgerForestPlot rows={forestRows} />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground lg:hidden">← 左右滑动查看完整坐标轴</p>
                <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                  {VERDICT_ORDER.map((verdict) => (
                    <span key={verdict} className="flex items-center gap-1.5">
                      <span
                        aria-hidden
                        className="inline-block size-2.5 rounded-full"
                        style={{ backgroundColor: JUDGER_VERDICT_META[verdict].color }}
                      />
                      {JUDGER_VERDICT_META[verdict].label}
                    </span>
                  ))}
                </div>
                <div className="flex flex-col gap-2 border-t pt-4">
                  <p className="text-sm font-medium">校正前后平均得分率</p>
                  <p className="text-xs text-muted-foreground">
                    空心环 = 原始，实心点 = 校正后；两点越接近说明校正对该讲师影响越小。
                  </p>
                  <div className="mx-auto w-full max-w-[26rem]">
                    <JudgerShiftChart rows={shiftRows} />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="min-w-0">
              <CardHeader>
                <CardTitle className="text-base">校正参数</CardTitle>
                <CardDescription>
                  可信度由数据给出，不可手改；人工权重用于模型看不到的因素（当天状态、题目分配特殊）。
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span className="font-medium">全局校正强度 λ</span>
                    <span className="tabular-nums text-muted-foreground">{lambda.toFixed(2)}</span>
                  </div>
                  <Slider
                    value={[lambda]}
                    min={0}
                    max={1}
                    step={0.05}
                    onValueChange={(values) => setLambda(values[0] ?? 0)}
                    thumbAriaLabel="全局校正强度"
                  />
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs text-muted-foreground">0 = 只看不校</p>
                    <div className="flex gap-1">
                      {[0, 0.5, 1].map((preset) => (
                        <Button
                          key={preset}
                          size="sm"
                          variant={Math.abs(lambda - preset) < 1e-9 ? "secondary" : "ghost"}
                          className="h-7 px-2 text-xs"
                          onClick={() => setLambda(preset)}
                        >
                          {preset === 0 ? "不校正" : preset === 0.5 ? "半量" : "全量"}
                        </Button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="flex flex-col gap-2 border-t pt-3">
                  <span className="text-sm font-medium">讲师人工权重</span>
                  {fit.judgers.map((estimate) => {
                    const weight = judgerManualWeight(options, estimate.judgerId);
                    return (
                      <div key={estimate.judgerId} className="flex items-center gap-2">
                        <span
                          className="w-14 shrink-0 truncate text-sm"
                          title={judgerName(estimate.judgerId)}
                        >
                          {judgerName(estimate.judgerId)}
                        </span>
                        <Slider
                          className="min-w-0 flex-1"
                          value={[weight]}
                          min={0}
                          max={2}
                          step={0.1}
                          onValueChange={(values) =>
                            setJudgerWeights((previous) => ({
                              ...previous,
                              [String(estimate.judgerId)]: values[0] ?? 1,
                            }))
                          }
                          thumbAriaLabel={`${judgerName(estimate.judgerId)} 的人工权重`}
                        />
                        <span className="w-7 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                          {weight.toFixed(1)}
                        </span>
                        <span
                          className="w-9 shrink-0 text-right text-xs tabular-nums text-muted-foreground"
                          title="可信度（数据给出，不可手改）"
                        >
                          {formatCredibility(estimate.credibility)}
                        </span>
                      </div>
                    );
                  })}
                </div>

                <label className="flex items-start gap-2 border-t pt-3 text-sm">
                  <Checkbox
                    checked={preserveTotal}
                    onCheckedChange={(checked) => setPreserveTotal(checked === true)}
                  />
                  <span>
                    保持整体均分不变
                    <span className="block text-xs text-muted-foreground">
                      补一个统一偏移，只重新分配分数，不抬高或压低整届均分。
                    </span>
                  </span>
                </label>

                <div className="flex flex-wrap items-center gap-2">
                  <Button size="sm" onClick={onSave} disabled={isSaving}>
                    {isSaving ? "保存中…" : "保存参数"}
                  </Button>
                  <Button size="sm" variant="outline" onClick={onReset} disabled={isSaving}>
                    重置
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    {isDirty ? "有未保存的改动" : "参数已保存"}
                  </span>
                </div>

                <p className="text-xs text-muted-foreground">
                  总分变化 {conservation > 0 ? "+" : ""}
                  {conservation} 分（整数舍入）
                  {preserveTotal ? " · 已保持整体均分" : " · 未保持整体均分"}
                  {changedCount > 0 ? ` · ${changedCount} 名考生名次变化` : " · 无名次变化"}
                </p>
                {!canCorrect ? (
                  <p className="text-xs text-muted-foreground">
                    当前没有可用于校正的量：无论 λ 取多少，结果都与原始分数一致。
                  </p>
                ) : null}
              </CardContent>
            </Card>
          </div>

          <Card className="min-w-0">
            <CardHeader>
              <CardTitle className="text-base">名次变化</CardTitle>
                <CardDescription>
                  按当前参数计算的考生名次；名次变化不等于「原来判错了」，它只是模型下的相对调整。
                </CardDescription>
                <CardAction className="flex items-center gap-2">
                  <div className="flex rounded-md border p-0.5">
                    <Button
                      size="sm"
                      variant={leaderboardFilter === "all" ? "secondary" : "ghost"}
                      className="h-7 px-2 text-xs"
                      onClick={() => setLeaderboardFilter("all")}
                    >
                      全部 {leaderboard.length}
                    </Button>
                    <Button
                      size="sm"
                      variant={leaderboardFilter === "changed" ? "secondary" : "ghost"}
                      className="h-7 px-2 text-xs"
                      onClick={() => setLeaderboardFilter("changed")}
                    >
                      仅变化 {changedCount}
                    </Button>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 gap-1 px-2 text-xs"
                    onClick={exportCsv}
                    disabled={filteredRows.length === 0}
                  >
                    <Download className="size-3.5" />
                    CSV
                  </Button>
                </CardAction>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                {filteredRows.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    {leaderboard.length === 0
                      ? "暂无评分数据。"
                      : "当前参数下没有任何考生的名次发生变化。"}
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <Table className="min-w-[360px]">
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-20">名次</TableHead>
                          <TableHead>考生</TableHead>
                          <TableHead className="text-right">
                            得分{commonMaxPoints !== null ? `（满分 ${commonMaxPoints}）` : ""}
                          </TableHead>
                          <TableHead className="text-right">得分率</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {visibleRows.map((row: GradingLeaderboardRow) => {
                          const candidate = candidateNameOf(candidateLabels, row.userFlowId);
                          return (
                            <TableRow key={row.userFlowId}>
                              <TableCell className="whitespace-nowrap tabular-nums">
                                <span className="text-muted-foreground">{row.rawRank}</span>
                                <span className="mx-0.5 text-muted-foreground">→</span>
                                <span className="font-medium">{row.adjustedRank}</span>
                                {row.rankDelta !== 0 ? (
                                  <Badge
                                    variant={row.rankDelta > 0 ? "secondary" : "outline"}
                                    className="ml-1.5 px-1.5"
                                  >
                                    {row.rankDelta > 0 ? `↑${row.rankDelta}` : `↓${Math.abs(row.rankDelta)}`}
                                  </Badge>
                                ) : null}
                              </TableCell>
                              <TableCell className="max-w-[10rem] truncate">
                                <span>{candidate.name}</span>
                                {candidate.studentId && candidate.studentId !== candidate.name ? (
                                  <span className="ml-1 hidden text-xs text-muted-foreground sm:inline">
                                    {candidate.studentId}
                                  </span>
                                ) : null}
                              </TableCell>
                              <TableCell className="text-right tabular-nums">
                                <span className="text-muted-foreground">{row.rawPoints}</span>
                                <span className="mx-1 text-muted-foreground">→</span>
                                <span>{row.adjustedPoints}</span>
                              </TableCell>
                              <TableCell className="whitespace-nowrap text-right tabular-nums">
                                <span className="text-muted-foreground">
                                  {formatPercent(row.rawRatio)}
                                </span>
                                <span className="mx-1 text-muted-foreground">→</span>
                                <span>{formatPercent(row.adjustedRatio)}</span>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
                {!showAllRows && filteredRows.length > LEADERBOARD_PAGE_SIZE ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="self-start"
                    onClick={() => setShowAllRows(true)}
                  >
                    显示全部 {filteredRows.length} 名（当前前 {LEADERBOARD_PAGE_SIZE} 名）
                  </Button>
                ) : null}
              </CardContent>
            </Card>

          <div className="grid min-w-0 gap-4 lg:grid-cols-2">
            <Card className="min-w-0">
              <CardHeader>
                <CardTitle className="text-base">诊断：讲师 × 题目 标准化残差</CardTitle>
                <CardDescription>
                  红 = 该讲师在这道题上高于模型预期，绿 = 低于预期（单位为残差标准差）。
                </CardDescription>
              </CardHeader>
              <CardContent className="flex justify-center overflow-x-auto">
                <JudgerResidualHeatmap rows={heatmap.rows} columns={heatmap.columns} />
              </CardContent>
            </Card>

            <div className="grid min-w-0 gap-y-3 rounded-lg border bg-card px-6 py-5 text-sm leading-relaxed text-muted-foreground">
            <p>
              <span className="font-medium text-foreground">宽严是相对量。</span>
              它表示「同考生同题目下，该讲师相对全体加权平均的系统性偏移」，不是「判错了多少」。
            </p>
            <p>
              <span className="font-medium text-foreground">校正只重新分配。</span>
              统一补一个偏移后整届均分不变（实时数值见上方参数面板），同一讲师内部的名次也不会改变。
            </p>
            <p>
              <span className="font-medium text-foreground">本页只读。</span>
              不写回评分、不影响官方成绩与结果发布；参数按流程保存，只作下次打开时的默认值。
              {detectable !== null
                ? ` 以当前样本量，约 ${Math.round(detectable * 100)}pp 以下的差异看不出来。`
                : ""}
            </p>
            <p>
              <span className="font-medium text-foreground">出现「不可判定」怎么办？</span>
              让同一名考生被 ≥2 名讲师评过（分别评不同题），或同一道题被 ≥2 名讲师评过（分别评不同考生）。
              模型定义与局限见 docs/GRADING_FAIRNESS_MODEL.md。
            </p>
            </div>
          </div>
        </>
      ) : (
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle className="text-base">讲师阅卷量（描述性，仅供参考）</CardTitle>
            <CardDescription>
              宽严无法分离时只能看原始口径：不同讲师的题目与考生构成不同，
              <strong className="font-medium">这些平均分之间不可直接比较</strong>，也不做任何校正。
            </CardDescription>
          </CardHeader>
          <CardContent>
            {descriptiveRows.length === 0 ? (
              <p className="text-sm text-muted-foreground">暂无评分数据。</p>
            ) : (
              <div className="overflow-x-auto">
                <Table className="min-w-[420px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead>阅卷讲师</TableHead>
                      <TableHead className="text-right">评分观测</TableHead>
                      <TableHead className="text-right">考生数</TableHead>
                      <TableHead className="text-right">平均得分率（未校正）</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {descriptiveRows.map((row) => (
                      <TableRow key={row.judgerId}>
                        <TableCell>{row.name}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {row.observationCount}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {row.candidateCount}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatPercent(row.rawMeanRatio)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
            <p className="mt-3 text-xs text-muted-foreground">
              要让这里出现可判定的宽严估计，需要「重叠」：同一名考生被 ≥2 名讲师评过（分别评不同题），
              或同一道题被 ≥2 名讲师评过（分别评不同考生）。
            </p>
          </CardContent>
        </Card>
      )}

      <p className="text-xs leading-relaxed text-muted-foreground">
        本页仅供人工参考：模型只用于发现「同考生同题目下讲师之间的系统性偏移」，不会写回官方成绩，
        也不改变任何结果发布。模型定义、可辨识性判据与局限见 docs/GRADING_FAIRNESS_MODEL.md。
      </p>
    </div>
  );
}
