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

const attemptTriggerText: Record<string, string> = {
  queue: "队列发送",
  manual_retry: "手动重试",
  batch_fallback: "直发 fallback",
  auto_retry: "自动重试",
  provider_event: "投递回执",
  test: "测试发送",
  interview_immediate: "面试通知",
  immediate: "立即发送",
  unknown: "未知来源",
};

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

function formatDuration(value: number | null) {
  if (value === null) return "-";
  if (value < 1000) return `${value} ms`;
  return `${(value / 1000).toFixed(1)} s`;
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
            <DetailItem
              label="尝试次数"
              value={
                delivery.attemptCount > 0
                  ? `${delivery.attemptCount} 次`
                  : "-"
              }
            />
            <DetailItem
              label="最近尝试"
              value={formatDate(delivery.lastAttemptAt)}
            />
            <DetailItem
              label="下次重试"
              value={formatDate(delivery.nextRetryAt)}
            />
            <DetailItem
              label="标记为无法自动重试"
              value={formatDate(delivery.deadLetteredAt)}
            />
            <DetailItem label="投递记录" value={`#${delivery.id}`} mono />
          </div>
        </section>

        <section className="rounded-lg border bg-card p-4">
          <h3 className="text-sm font-semibold">发送尝试</h3>
          {delivery.attempts.length === 0 ? (
            <p className="mt-3 rounded-md border border-dashed bg-muted px-3 py-2 text-sm text-muted-foreground">
              暂无发送尝试记录。
            </p>
          ) : (
            <div className="mt-3 flex flex-col gap-2">
              {delivery.attempts.map((attempt) => (
                <div
                  key={attempt.id}
                  className="grid gap-3 rounded-md border bg-muted/50 px-3 py-3 lg:grid-cols-[minmax(120px,0.8fr)_minmax(140px,1fr)_minmax(120px,0.8fr)_minmax(160px,1.2fr)]"
                >
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">状态</p>
                    <Badge
                      variant="outline"
                      className={cn(
                        "mt-1",
                        getDeliveryStatusBadgeClass(attempt.status),
                      )}
                    >
                      {deliveryStatusText[attempt.status] ?? attempt.status}
                    </Badge>
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">来源</p>
                    <p className="mt-1 truncate text-sm">
                      {attemptTriggerText[attempt.trigger] ?? attempt.trigger}
                    </p>
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">开始时间</p>
                    <p className="mt-1 truncate text-sm">
                      {formatDate(attempt.startedAt)}
                    </p>
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">
                      耗时 / Message ID
                    </p>
                    <p className="mt-1 truncate font-mono text-xs">
                      {formatDuration(attempt.durationMs)} /{" "}
                      {attempt.providerMessageId ?? "-"}
                    </p>
                  </div>
                  {attempt.errorMessage && (
                    <div className="min-w-0 rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2 lg:col-span-4">
                      <p className="text-xs text-destructive">错误</p>
                      <p className="mt-1 break-words text-sm text-destructive">
                        {attempt.errorMessage}
                      </p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
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
            sandbox=""
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
  const canRetry =
    delivery.status === "failed" ||
    delivery.status === "pending" ||
    delivery.status === "dead";
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
