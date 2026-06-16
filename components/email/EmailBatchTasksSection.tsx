"use client";

import { recoverStaleEmailBatch, sendEmailBatch } from "@/action/email/send";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CheckCircle2, Clock3, MailOpen, RotateCcw, TriangleAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import {
  batchStatusText,
  formatDate,
  getBatchStatusBadgeClass,
} from "./emailDashboardConstants";
import { EmailBatchStatusDialog } from "./EmailBatchStatusDialog";
import { PreviewDialog } from "./emailDashboardDialogs";
import type { EmailBatch } from "./emailDashboardTypes";

function RecoverStaleBatchButton({
  batchId,
  className,
}: {
  batchId: number;
  className?: string;
}) {
  const router = useRouter();

  return (
    <Button
      variant="outline"
      size="sm"
      className={className}
      onClick={() => {
        toast.promise(
          recoverStaleEmailBatch(batchId).then((result) => {
            router.refresh();
            return result;
          }),
          {
            loading: "正在检查中断任务",
            success: (result) =>
              result.recoveredCount > 0
                ? `已恢复 ${result.recoveredCount} 封，可重新重试`
                : "没有超过 10 分钟的中断任务",
            error: (error) =>
              error instanceof Error ? error.message : "恢复失败",
          },
        );
      }}
    >
      <RotateCcw data-icon="inline-start" />
      恢复中断
    </Button>
  );
}

function BatchMetric({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number;
  tone?: "default" | "success" | "danger" | "warning";
}) {
  return (
    <div
      className={cn(
        "rounded-md border bg-background/55 p-3",
        tone === "success" && "border-primary/25 bg-primary/5",
        tone === "danger" && "border-destructive/25 bg-destructive/5",
        tone === "warning" && "border-chart-3/30 bg-chart-3/10",
      )}
    >
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold tabular-nums leading-none">
        {value}
      </p>
    </div>
  );
}

function BatchProgress({ batch }: { batch: EmailBatch }) {
  const total = Math.max(batch.totalCount, 0);
  const sentPercent = total > 0 ? (batch.counts.sent / total) * 100 : 0;
  const failedPercent = total > 0 ? (batch.counts.failed / total) * 100 : 0;
  const deadPercent = total > 0 ? (batch.counts.dead / total) * 100 : 0;
  const sendingPercent = total > 0 ? (batch.counts.sending / total) * 100 : 0;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
        <span>发送进度</span>
        <span className="tabular-nums">
          {batch.counts.sent + batch.counts.failed + batch.counts.dead}/
          {batch.totalCount}
        </span>
      </div>
      <div className="flex h-1.5 overflow-hidden rounded-full bg-muted">
        <div className="bg-primary" style={{ width: `${sentPercent}%` }} />
        <div className="bg-destructive" style={{ width: `${failedPercent}%` }} />
        <div className="bg-destructive/70" style={{ width: `${deadPercent}%` }} />
        <div className="bg-chart-3" style={{ width: `${sendingPercent}%` }} />
      </div>
    </div>
  );
}

function BatchActions({
  batch,
  preview,
  canRecover,
  canRetry,
}: {
  batch: EmailBatch;
  preview: string | null;
  canRecover: boolean;
  canRetry: boolean;
}) {
  const router = useRouter();

  return (
    <div className="grid gap-2 min-[560px]:flex min-[560px]:flex-wrap min-[560px]:justify-end">
      <PreviewDialog
        title={`${batch.flowTitle} 查看邮件`}
        html={preview}
        triggerLabel="查看邮件"
        triggerClassName="w-full min-[560px]:w-auto"
        description="每位收件人的邮件正文都会保存；这里展示该批次第一封。"
      />
      <EmailBatchStatusDialog batch={batch} />
      {canRecover && (
        <RecoverStaleBatchButton
          batchId={batch.id}
          className="w-full min-[560px]:w-auto"
        />
      )}
      <Button
        variant="outline"
        size="sm"
        disabled={!canRetry}
        className="w-full min-[560px]:w-auto"
        onClick={() => {
          toast.promise(
            sendEmailBatch(batch.id).then(() => router.refresh()),
            {
              loading: "正在处理邮件发送",
              success: "邮件发送任务已处理",
              error: (error) =>
                error instanceof Error ? error.message : "操作失败",
            },
          );
        }}
      >
        <RotateCcw data-icon="inline-start" />
        重试
      </Button>
    </div>
  );
}

export function EmailBatchTasksSection({ batches }: { batches: EmailBatch[] }) {
  return (
    <section className="overflow-hidden rounded-xl border bg-card/80 shadow-sm">
      <div className="flex flex-col gap-2 border-b p-4 lg:flex-row lg:items-start lg:justify-between lg:p-5">
        <div>
          <h2 className="text-lg font-semibold">批量任务</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            最近 20 个发送任务；这里保留批量发送、重试和明细。
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-md border bg-background/55 px-2.5 py-1 text-xs text-muted-foreground">
          <Clock3 className="size-3.5" />
          自动刷新发送中的任务
        </div>
      </div>
      <div className="flex flex-col gap-3 p-4 lg:p-5">
        {batches.length === 0 ? (
          <div className="rounded-lg border border-dashed bg-background/30 p-10 text-center">
            <MailOpen className="mx-auto size-6 text-muted-foreground" />
            <p className="mt-3 text-sm font-medium">暂无发送任务</p>
            <p className="mt-1 text-sm text-muted-foreground">
              已有“邮件已发”状态的人员会计入上方已发人数。
            </p>
          </div>
        ) : (
          batches.map((batch) => {
            const deliveries = Array.isArray(batch.deliveries) ? batch.deliveries : [];
            const preview = deliveries[0]?.htmlSnapshot ?? null;
            const canRetry =
              batch.counts.pending > 0 ||
              batch.counts.failed > 0 ||
              batch.counts.dead > 0;
            const canRecover = batch.counts.sending > 0;
            return (
              <article
                key={batch.id}
                className={cn(
                  "rounded-lg border bg-background/45 p-4 transition-colors hover:bg-background/70",
                  batch.status === "failed" && "border-destructive/25",
                  batch.status === "queued" && "border-chart-3/30",
                )}
              >
                <div className="grid gap-4 xl:grid-cols-[minmax(260px,1.2fr)_minmax(260px,1fr)_auto] xl:items-start">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className={getBatchStatusBadgeClass(batch.status)}>
                        {batchStatusText[batch.status]}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {batch.accept ? "通过通知" : "不通过通知"}
                      </span>
                    </div>
                    <p className="mt-2 break-words text-sm font-semibold leading-5">
                      {batch.flowTitle}
                    </p>
                    <p className="mt-1 break-words text-xs text-muted-foreground">
                      {batch.subject}
                    </p>
                  </div>

                  <div className="grid gap-3">
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-2 2xl:grid-cols-4">
                      <BatchMetric label="人数" value={batch.totalCount} />
                      <BatchMetric label="成功" value={batch.counts.sent} tone="success" />
                      <BatchMetric
                        label="失败"
                        value={batch.counts.failed + batch.counts.dead}
                        tone={
                          batch.counts.failed + batch.counts.dead > 0
                            ? "danger"
                            : "default"
                        }
                      />
                      <BatchMetric
                        label="待处理"
                        value={batch.counts.pending + batch.counts.sending}
                        tone={
                          batch.counts.pending + batch.counts.sending > 0
                            ? "warning"
                            : "default"
                        }
                      />
                    </div>
                    <BatchProgress batch={batch} />
                  </div>

                  <div className="flex flex-col gap-3 xl:items-end">
                    <div className="grid gap-1 text-xs text-muted-foreground xl:text-right">
                      <span className="inline-flex items-center gap-1.5">
                        <CheckCircle2 className="size-3.5 text-primary" />
                        操作人：{batch.createdByName ?? "-"}
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <Clock3 className="size-3.5" />
                        {formatDate(batch.createdAt)}
                      </span>
                      {batch.counts.failed + batch.counts.dead > 0 && (
                        <span className="inline-flex items-center gap-1.5 text-destructive">
                          <TriangleAlert className="size-3.5" />
                          有失败投递待处理
                        </span>
                      )}
                    </div>
                    <BatchActions
                      batch={batch}
                      preview={preview}
                      canRecover={canRecover}
                      canRetry={canRetry}
                    />
                  </div>
                </div>
              </article>
            );
          })
        )}
      </div>
    </section>
  );
}
