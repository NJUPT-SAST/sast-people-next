"use client";

import { recoverStaleEmailBatch, sendEmailBatch } from "@/action/email/send";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { MailOpen, RotateCcw } from "lucide-react";
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

function RecoverStaleBatchButton({ batchId }: { batchId: number }) {
  const router = useRouter();
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => {
        toast.promise(
          recoverStaleEmailBatch(batchId).then((result) => {
            router.refresh();
            return result;
          }),
          {
            loading: "正在检查中断任务…",
            success: (result) =>
              result.recoveredCount > 0
                ? `已恢复 ${result.recoveredCount} 封`
                : "没有可恢复的中断任务",
            error: (error) =>
              error instanceof Error ? error.message : "恢复失败",
          },
        );
      }}
    >
      <RotateCcw data-icon="inline-start" />
      恢复
    </Button>
  );
}

function RetryBatchButton({
  batchId,
  disabled,
}: {
  batchId: number;
  disabled: boolean;
}) {
  const router = useRouter();
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={disabled}
      onClick={() => {
        toast.promise(
          sendEmailBatch(batchId).then(() => router.refresh()),
          {
            loading: "正在重试…",
            success: "已重新排队发送",
            error: (error) =>
              error instanceof Error ? error.message : "重试失败",
          },
        );
      }}
    >
      <RotateCcw data-icon="inline-start" />
      重试
    </Button>
  );
}

export function EmailBatchTasksSection({ batches }: { batches: EmailBatch[] }) {
  return (
    <section className="overflow-hidden rounded-xl border bg-card/80 shadow-sm">
      <div className="border-b px-4 py-4 sm:px-5">
        <h2 className="text-base font-semibold">最近发送</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          本页最近的批量发送，失败时可重试。
        </p>
      </div>

      <div className="flex flex-col divide-y">
        {batches.length === 0 ? (
          <div className="p-10 text-center">
            <MailOpen className="mx-auto size-6 text-muted-foreground" />
            <p className="mt-3 text-sm font-medium">还没有发送记录</p>
            <p className="mt-1 text-sm text-muted-foreground">
              上方发送后，会出现在这里。
            </p>
          </div>
        ) : (
          batches.map((batch) => {
            const deliveries = Array.isArray(batch.deliveries)
              ? batch.deliveries
              : [];
            const preview = deliveries[0]?.htmlSnapshot ?? null;
            const failed = batch.counts.failed + batch.counts.dead;
            const canRetry = batch.counts.pending > 0 || failed > 0;
            const canRecover = batch.counts.sending > 0;
            const summary = [
              `成功 ${batch.counts.sent}`,
              failed > 0 ? `失败 ${failed}` : null,
              batch.counts.pending + batch.counts.sending > 0
                ? `进行中 ${batch.counts.pending + batch.counts.sending}`
                : null,
            ]
              .filter(Boolean)
              .join(" · ");

            return (
              <article
                key={batch.id}
                className={cn(
                  "flex flex-col gap-3 px-4 py-4 sm:px-5 lg:flex-row lg:items-center lg:justify-between",
                  batch.status === "failed" && "bg-destructive/5",
                )}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge
                      variant="outline"
                      className={getBatchStatusBadgeClass(batch.status)}
                    >
                      {batchStatusText[batch.status] ?? batch.status}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {batch.accept ? "通过" : "不通过"}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {formatDate(batch.createdAt)}
                    </span>
                  </div>
                  <p className="mt-1.5 truncate text-sm font-medium">
                    {batch.flowTitle}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
                    共 {batch.totalCount} 人 · {summary}
                  </p>
                </div>

                <div className="flex flex-wrap gap-2 lg:justify-end">
                  <PreviewDialog
                    title={batch.flowTitle}
                    html={preview}
                    triggerLabel="预览"
                    description="展示该批次中一封邮件的正文快照。"
                  />
                  <EmailBatchStatusDialog batch={batch} />
                  {canRecover && <RecoverStaleBatchButton batchId={batch.id} />}
                  <RetryBatchButton batchId={batch.id} disabled={!canRetry} />
                </div>
              </article>
            );
          })
        )}
      </div>
    </section>
  );
}
