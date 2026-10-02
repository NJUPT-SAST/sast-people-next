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

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words">{value}</dd>
    </div>
  );
}

/** 单轮分区：面评列表 + 均分行 + 名单确认结论 */
function RoundSection({ round }: { round: OfficeRecordRound }) {
  const isFinal = round.round === 2;
  const title = isFinal ? "二面" : "一面";
  /* 只有实际打过分且计入均分的面评才记为「部长」份数 */
  const scoredCount = round.evaluations.filter(
    (evaluation) => evaluation.score !== null,
  ).length;

  return (
    <section aria-label={`${title}记录`} className="space-y-2 rounded-lg border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-sm font-semibold">{title}</h4>
        <span className="text-xs text-muted-foreground">
          {isFinal ? "2-3 位部长分别打分，取平均" : "1 位部长考察，只给最终分"}
        </span>
      </div>

      {round.evaluations.length === 0 ? (
        <p className="rounded-md border border-dashed bg-muted/20 p-4 text-center text-sm text-muted-foreground">
          尚未记录{title}面评
        </p>
      ) : (
        <ul className="space-y-2">
          {round.evaluations.map((evaluation) => (
            <li key={evaluation.id} className="rounded-md border bg-card p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                <span className="font-medium">
                  {evaluation.authorName ?? "未知面试官"}
                  {evaluation.isMine && (
                    <span className="ml-1 text-xs text-muted-foreground">（我）</span>
                  )}
                </span>
                <span className="tabular-nums">
                  分数 {evaluation.score ?? "未打分"}
                  {evaluation.recommendation && (
                    <span className="text-muted-foreground">
                      {" · "}
                      {evaluation.recommendation === "passed"
                        ? "建议通过"
                        : "建议不通过"}
                    </span>
                  )}
                </span>
              </div>
              <p className="mt-1 whitespace-pre-wrap break-words text-muted-foreground">
                {evaluation.content}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {formatTime(evaluation.createdAt)}
              </p>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
        <span className="text-muted-foreground">{title}均分</span>
        {round.averageScore === null ? (
          <span className="text-muted-foreground">暂无</span>
        ) : (
          <span className="font-medium tabular-nums">
            {round.averageScore}
            <span className="ml-1 text-xs text-muted-foreground">
              · {scoredCount} 位部长
            </span>
          </span>
        )}
      </div>

      <div className="rounded-md border bg-muted/20 p-3 text-sm">
        <p className="font-medium text-muted-foreground">名单确认</p>
        {round.decision === null ? (
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            该轮还没有确认名单。部长结束这一轮后会在这里留档：结论、操作人，以及确认时刻的均分与份数。
          </p>
        ) : (
          <>
            <p className="mt-1">
              <span
                className={
                  round.decision.passed ? "text-primary" : "text-destructive"
                }
              >
                {round.decision.passed ? "通过" : "未通过"}
              </span>
              <span className="text-muted-foreground">
                {" · "}
                {formatTime(round.decision.decidedAt)}
              </span>
            </p>
            <p className="text-xs text-muted-foreground">
              操作人 {round.decision.decidedBy ?? "未知"}
              {" · "}
              确认时刻均分 {round.decision.averageScore ?? "无"}（
              {round.decision.evaluationCount} 份）
            </p>
          </>
        )}
      </div>
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
            {record
              ? `${record.candidate.name} 的两轮面评与名单确认结论。`
              : "查看候选人两轮面评与名单确认结论。"}
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

            <dl className="grid grid-cols-1 gap-x-4 gap-y-2 rounded-lg border bg-muted/20 p-3 text-sm sm:grid-cols-2">
              <InfoRow
                label="志愿"
                value={
                  record.candidate.choice === 1
                    ? "第一志愿"
                    : record.candidate.choice === 2
                      ? "第二志愿"
                      : "未填写"
                }
              />
              <InfoRow
                label="另一志愿部门"
                value={
                  record.candidate.siblingDepartment
                    ? departmentLabel(record.candidate.siblingDepartment)
                    : "无"
                }
              />
              <InfoRow
                label="面试时段"
                value={record.candidate.interviewSlot ?? "未选择"}
              />
              <InfoRow
                label="最终去向"
                value={
                  record.candidate.finalDepartment
                    ? departmentLabel(record.candidate.finalDepartment)
                    : "未确定"
                }
              />
            </dl>

            {record.rounds.map((round) => (
              <RoundSection key={round.round} round={round} />
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
