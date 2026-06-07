"use client";

import { retryEmailDelivery } from "@/action/email/delivery";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { Copy, Eye, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import {
  deliveryStatusText,
  emailCategoryText,
  formatDate,
  getDeliveryStatusBadgeClass,
  hiddenScrollbar,
} from "./emailDashboardConstants";
import type { EmailDeliveryRecord } from "./emailDashboardTypes";

function DetailItem({
  label,
  value,
  mono = false,
  href,
}: {
  label: string;
  value: string | number | null | undefined;
  mono?: boolean;
  href?: string;
}) {
  const content = (
    <p className={cn("mt-1 break-words text-sm", mono && "font-mono text-xs")}>
      {value || "-"}
    </p>
  );

  return (
    <div className="min-w-0 rounded-md border bg-background px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      {href && value ? (
        <Link className="text-primary hover:underline" href={href}>
          {content}
        </Link>
      ) : (
        content
      )}
    </div>
  );
}

function EmailDeliveryDetailDialog({
  delivery,
  compact,
  onRetry,
  canRetry,
}: {
  delivery: EmailDeliveryRecord;
  compact: boolean;
  onRetry: () => void;
  canRetry: boolean;
}) {
  const recruitmentHref = delivery.flowId
    ? `/dashboard/recruitment?flowId=${delivery.flowId}${
        delivery.userFlowId ? `&userFlowId=${delivery.userFlowId}` : ""
      }${
        delivery.relatedScheduleId
          ? `&scheduleId=${delivery.relatedScheduleId}`
          : ""
      }`
    : null;
  const flowHref = delivery.flowId
    ? `/dashboard/flow?flowId=${delivery.flowId}`
    : null;
  const batchHref = delivery.batchId
    ? `/dashboard/emails?tab=tasks&batchId=${delivery.batchId}`
    : null;

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={compact ? "w-full min-[560px]:w-auto" : undefined}
        >
          <Eye data-icon="inline-start" />
          查看详情
        </Button>
      </DialogTrigger>
      <DialogContent
        className={cn(
          "max-h-[85dvh] w-[calc(100vw-2rem)] max-w-5xl overflow-y-auto",
          hiddenScrollbar,
        )}
      >
        <DialogHeader className="pr-8">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <DialogTitle className="break-words">{delivery.subject}</DialogTitle>
              <DialogDescription className="mt-2 break-words">
                {delivery.toAddress}
              </DialogDescription>
            </div>
            <Badge
              variant="outline"
              className={getDeliveryStatusBadgeClass(delivery.status)}
            >
              {deliveryStatusText[delivery.status] ?? delivery.status}
            </Badge>
          </div>
        </DialogHeader>

        {delivery.errorMessage && (
          <section className="rounded-lg border border-destructive/30 bg-destructive/5 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-destructive">失败原因</h3>
                <p className="mt-2 break-words text-sm text-muted-foreground">
                  {delivery.errorMessage}
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!canRetry}
                onClick={onRetry}
              >
                <RotateCcw data-icon="inline-start" />
                重试
              </Button>
            </div>
          </section>
        )}

        <section className="rounded-lg border bg-card p-4">
          <h3 className="text-sm font-semibold">投递信息</h3>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <DetailItem
              label="邮件类型"
              value={emailCategoryText[delivery.category] ?? delivery.category}
            />
            <DetailItem label="模板" value={delivery.templateKey} mono />
            <DetailItem label="收件地址" value={delivery.toAddress} mono />
            <DetailItem label="收件人" value={delivery.userName} />
            <DetailItem label="学号" value={delivery.studentId} mono />
            <DetailItem label="创建人" value={delivery.createdByName} />
            <DetailItem label="创建时间" value={formatDate(delivery.createdAt)} />
            <DetailItem label="发送时间" value={formatDate(delivery.sentAt)} />
            <DetailItem label="投递记录" value={`#${delivery.id}`} mono />
          </div>
        </section>

        <section className="rounded-lg border bg-card p-4">
          <h3 className="text-sm font-semibold">关联对象</h3>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <DetailItem
              label="流程"
              value={delivery.flowTitle ?? delivery.batchName}
              href={recruitmentHref ?? flowHref ?? undefined}
            />
            <DetailItem
              label="流程 ID"
              value={delivery.flowId ? `#${delivery.flowId}` : null}
              href={flowHref ?? undefined}
              mono
            />
            <DetailItem
              label="批量任务"
              value={delivery.batchId ? `#${delivery.batchId}` : null}
              href={batchHref ?? undefined}
              mono
            />
            <DetailItem
              label="报名记录"
              value={delivery.userFlowId ? `#${delivery.userFlowId}` : null}
              href={recruitmentHref ?? undefined}
              mono
            />
            <DetailItem
              label="面试预约"
              value={delivery.relatedScheduleId ? `#${delivery.relatedScheduleId}` : null}
              href={recruitmentHref ?? undefined}
              mono
            />
          </div>
        </section>

        <section className="rounded-lg border bg-card p-4">
          <h3 className="text-sm font-semibold">正文快照</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            这里展示发送前保存的正文快照，后续模板修改不会影响此内容。
          </p>
          <iframe
            title={`${delivery.subject} 邮件正文`}
            srcDoc={delivery.htmlSnapshot}
            className="mt-3 h-[60vh] w-full rounded-md border bg-background"
          />
        </section>
      </DialogContent>
    </Dialog>
  );
}

export function EmailRecordActions({
  delivery,
  compact = false,
}: {
  delivery: EmailDeliveryRecord;
  compact?: boolean;
}) {
  const router = useRouter();
  const canRetry = delivery.status === "failed" || delivery.status === "pending";
  const handleRetry = () => {
    toast.promise(
      retryEmailDelivery(delivery.id).then((result) => {
        router.refresh();
        return result;
      }),
      {
        loading: "正在重试邮件",
        success: (result) =>
          result.skipped ? "邮件已发送，无需重试" : "邮件已重新发送",
        error: (error) =>
          error instanceof Error ? error.message : "重试失败",
      },
    );
  };

  return (
    <div
      className={
        compact
          ? "grid gap-2 min-[560px]:flex min-[560px]:justify-end"
          : "flex flex-wrap justify-end gap-2"
      }
    >
      <EmailDeliveryDetailDialog
        delivery={delivery}
        compact={compact}
        onRetry={handleRetry}
        canRetry={canRetry}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        className={compact ? "w-full min-[560px]:w-auto" : undefined}
        onClick={() => {
          if (!navigator.clipboard?.writeText) {
            toast.error("当前浏览器不支持自动复制，请手动复制");
            return;
          }

          navigator.clipboard
            .writeText(delivery.toAddress)
            .then(() => toast.success("收件地址已复制"))
            .catch(() => toast.error("复制失败，请手动复制"));
        }}
      >
        <Copy data-icon="inline-start" />
        复制地址
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={!canRetry}
        className={compact ? "w-full min-[560px]:w-auto" : undefined}
        onClick={handleRetry}
      >
        <RotateCcw data-icon="inline-start" />
        重试
      </Button>
    </div>
  );
}
