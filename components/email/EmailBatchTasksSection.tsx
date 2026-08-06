"use client";

import { recoverStaleEmailBatch, sendEmailBatch } from "@/action/email/send";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RotateCcw } from "lucide-react";
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
            loading: "正在恢复…",
            success: (result) =>
              result.recoveredCount > 0
                ? `已恢复 ${result.recoveredCount} 封`
                : "没有可恢复项",
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
            success: "已重新发送",
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
    <section className="overflow-hidden rounded-lg border bg-card">
      <div className="border-b px-4 py-3 sm:px-5">
        <h2 className="text-sm font-semibold">最近发送</h2>
      </div>

      <div className="flex flex-col divide-y">
        {batches.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted-foreground">
            发送后会出现在这里
          </p>
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
                className="flex flex-col gap-2 px-4 py-3 sm:px-5 lg:flex-row lg:items-center lg:justify-between"
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
                      {batch.accept ? "通过" : "不通过"} · {formatDate(batch.createdAt)}
                    </span>
                  </div>
                  <p className="mt-1 truncate text-sm font-medium">
                    {batch.flowTitle}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {summary}
                    {batch.subject ? ` · ${batch.subject}` : ""}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 lg:justify-end">
                  <PreviewDialog
                    title={batch.flowTitle}
                    html={preview}
                    triggerLabel="预览"
                    triggerSize="sm"
                  />
                  <EmailBatchStatusDialog batch={batch} />
                  {canRecover && <RecoverStaleBatchButton batchId={batch.id} />}
                  {canRetry && (
                    <RetryBatchButton batchId={batch.id} disabled={false} />
                  )}
                </div>
              </article>
            );
          })
        )}
      </div>
    </section>
  );
}
