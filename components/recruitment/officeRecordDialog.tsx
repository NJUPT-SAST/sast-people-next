"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import {
  getOfficeInterviewRecord,
  type OfficeInterviewRecord,
  type OfficeRecordRound,
} from "@/action/user-flow/office-record";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { departmentLabel } from "@/const/department";
import dayjs from "@/lib/dayjs";

const statusLabels: Record<string, string> = {
  ongoing: "进行中",
  passed: "通过",
  failed: "不通过",
  withdrawn: "未参与",
  accepted: "通过邮件已发",
  rejected: "不通过邮件已发",
};

const statusClassNames: Record<string, string> = {
  ongoing: "border-chart-3/30 bg-chart-3/10 text-chart-3",
  passed: "border-primary/30 bg-primary/10 text-primary",
  accepted: "border-primary/30 bg-primary/10 text-primary",
  failed: "border-destructive/30 bg-destructive/10 text-destructive",
  rejected: "border-destructive/30 bg-destructive/10 text-destructive",
};

const formatTime = (value: string | null) =>
  value ? dayjs(value).format("YYYY-MM-DD HH:mm") : "—";

/** 单轮分区：面评列表 + 均分/名单确认结论（只读回溯，决策快照保留） */
function RoundSection({ round }: { round: OfficeRecordRound }) {
  const isFinal = round.round === 2;
  const title = isFinal ? "二面" : "一面";
  /* 只有实际打过分且计入均分的面评才记为「部长」份数 */
  const scoredCount = round.evaluations.filter(
    (evaluation) => evaluation.score !== null,
  ).length;

  return (
    <section
      aria-label={`${title}记录`}
      className="space-y-2 border-t pt-4 first:border-t-0 first:pt-0"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h4 className="text-sm font-semibold">{title}</h4>
        {round.averageScore !== null && (
          <span className="text-xs tabular-nums text-muted-foreground">
            均分 {round.averageScore} · {scoredCount} 份
          </span>
        )}
      </div>

      {round.evaluations.length === 0 ? (
        <p className="rounded-md border border-dashed bg-muted/20 px-3 py-2.5 text-sm text-muted-foreground">
          尚未记录{title}面评
        </p>
      ) : (
        <ul className="space-y-2">
          {round.evaluations.map((evaluation) => (
            <li key={evaluation.id} className="rounded-md border bg-card p-3">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <span className="text-sm font-medium">
                  {evaluation.authorName ?? "未知面试官"}
                  {evaluation.isMine && (
                    <span className="ml-1 text-xs font-normal text-muted-foreground">
                      （我）
                    </span>
                  )}
                </span>
                <span className="shrink-0 text-sm font-semibold tabular-nums">
                  {evaluation.score !== null ? `${evaluation.score} 分` : "未打分"}
                </span>
              </div>
              <p className="mt-1 whitespace-pre-wrap break-words text-sm">
                {evaluation.content}
              </p>
              <p className="mt-1.5 text-xs text-muted-foreground">
                {formatTime(evaluation.createdAt)}
                {evaluation.recommendation &&
                  ` · ${
                    evaluation.recommendation === "passed"
                      ? "建议通过"
                      : "建议不通过"
                  }`}
              </p>
            </li>
          ))}
        </ul>
      )}

      {round.decision === null
        ? round.evaluations.length > 0 && (
            <p className="text-xs text-muted-foreground">名单确认：尚未确认</p>
          )
        : (
            <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-xs text-muted-foreground">
              <span>名单确认</span>
              <span
                className={
                  round.decision.passed
                    ? "font-medium text-primary"
                    : "font-medium text-destructive"
                }
              >
                {round.decision.passed ? "通过" : "未通过"}
              </span>
              <span>{formatTime(round.decision.decidedAt)}</span>
              <span>操作人 {round.decision.decidedBy ?? "未知"}</span>
              <span>
                确认时刻均分 {round.decision.averageScore ?? "无"}（
                {round.decision.evaluationCount} 份）
              </span>
            </p>
          )}
    </section>
  );
}

/**
 * 候选人「全部面试记录」弹窗：两轮面评 + 每轮名单确认结论。
 * 只读视图，供部长回溯判定依据（分数在名单确认后仍可能补录，故同时展示确认时刻快照）。
 */
export function OfficeRecordDialog({
  open,
  userFlowId,
  onOpenChange,
}: {
  open: boolean;
  userFlowId: number | null;
  onOpenChange: (open: boolean) => void;
}) {
  const [record, setRecord] = useState<OfficeInterviewRecord | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /* 手动重试：变更计数即可重新触发下面这个 effect */
  const [retryToken, setRetryToken] = useState(0);

  useEffect(() => {
    if (!open || userFlowId === null) return;
    /* 候选人切换或弹窗快速开关时丢弃过期响应 */
    let cancelled = false;
    setLoading(true);
    setError(null);
    setRecord(null);
    getOfficeInterviewRecord(userFlowId)
      .then((data) => {
        if (!cancelled) setRecord(data);
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setError(
            cause instanceof Error ? cause.message : "加载面试记录失败，请重试",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, userFlowId, retryToken]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88dvh] w-[calc(100vw-2rem)] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>全部面试记录</DialogTitle>
          <DialogDescription>
            两轮面评与名单确认结论。
          </DialogDescription>
        </DialogHeader>

        {loading && (
          <p className="py-10 text-center text-sm text-muted-foreground">
            加载中…
          </p>
        )}

        {!loading && error && (
          <div className="space-y-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
            <p className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <span>{error}</span>
            </p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setRetryToken((token) => token + 1)}
            >
              <RefreshCw data-icon="inline-start" />
              重试
            </Button>
          </div>
        )}

        {!loading && !error && record && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="truncate text-base font-semibold">
                  {record.candidate.name}
                </h3>
                <p className="truncate font-mono text-xs text-muted-foreground">
                  学号 {record.candidate.studentId ?? "未填写"} · QQ{" "}
                  {record.candidate.qq ?? "未填写"}
                </p>
              </div>
              <Badge
                variant="outline"
                className={statusClassNames[record.candidate.status]}
              >
                {statusLabels[record.candidate.status] ?? record.candidate.status}
              </Badge>
            </div>

            {/* 关键信息压成一行：志愿 / 另一志愿 / 时段 / 最终去向（不再各占一个边框格子） */}
            <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span className="flex items-baseline gap-1">
                志愿
                <span className="text-foreground">
                  {record.candidate.choice === 1
                    ? "第一志愿"
                    : record.candidate.choice === 2
                      ? "第二志愿"
                      : "未填写"}
                </span>
              </span>
              <span className="flex items-baseline gap-1">
                另一志愿
                <span className="text-foreground">
                  {record.candidate.siblingDepartment
                    ? departmentLabel(record.candidate.siblingDepartment)
                    : "无"}
                </span>
              </span>
              <span className="flex items-baseline gap-1">
                时段
                <span className="text-foreground">
                  {record.candidate.interviewSlot ?? "未选择"}
                </span>
              </span>
              <span className="flex items-baseline gap-1">
                最终去向
                <span className="text-foreground">
                  {record.candidate.finalDepartment
                    ? departmentLabel(record.candidate.finalDepartment)
                    : "未确定"}
                </span>
              </span>
            </p>

            <div className="space-y-4">
              {record.rounds.map((round) => (
                <RoundSection key={round.round} round={round} />
              ))}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
