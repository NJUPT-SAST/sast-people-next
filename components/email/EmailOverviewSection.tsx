"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Server,
  ShieldCheck,
} from "lucide-react";

import {
  batchStatusText,
  deliveryStatusText,
  getBatchStatusBadgeClass,
  getDeliveryStatusBadgeClass,
  isToday,
} from "./emailDashboardConstants";
import type {
  EmailBatch,
  EmailCenterConfig,
  EmailDeliveryRecord,
} from "./emailDashboardTypes";

function MetricBlock({
  label,
  value,
  detail,
  tone = "default",
}: {
  label: string;
  value: number | string;
  detail?: string;
  tone?: "default" | "success" | "warning" | "danger";
}) {
  return (
    <div
      className={cn(
        "rounded-lg border bg-background/45 p-4 transition-colors hover:bg-background/70",
        tone === "success" && "border-primary/25 bg-primary/5",
        tone === "warning" && "border-chart-3/25 bg-chart-3/5",
        tone === "danger" && "border-destructive/25 bg-destructive/5",
      )}
    >
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-2 text-2xl font-semibold tabular-nums leading-none">
        {value}
      </p>
      {detail && (
        <p className="mt-2 line-clamp-2 text-xs leading-5 text-muted-foreground">
          {detail}
        </p>
      )}
    </div>
  );
}

function EmptyPanel({ children }: { children: string }) {
  return (
    <div className="rounded-lg border border-dashed bg-background/30 p-8 text-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}

function ConfigItem({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <div className="rounded-lg border bg-background/45 p-4">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-2 break-words text-sm font-semibold">{value}</p>
      {detail && (
        <p className="mt-1 break-words text-xs text-muted-foreground">{detail}</p>
      )}
    </div>
  );
}

export function EmailOverviewSection({
  batches,
  deliveries,
  emailCenterConfig,
}: {
  batches: EmailBatch[];
  deliveries: EmailDeliveryRecord[];
  emailCenterConfig: EmailCenterConfig;
}) {
  const todayDeliveries = deliveries.filter((delivery) =>
    isToday(delivery.sentAt ?? delivery.createdAt),
  );
  const todaySentCount = todayDeliveries.filter(
    (delivery) => delivery.status === "sent",
  ).length;
  const todayFailedCount = todayDeliveries.filter(
    (delivery) => delivery.status === "failed",
  ).length;
  const pendingCount = deliveries.filter(
    (delivery) => delivery.status === "pending",
  ).length;
  const sendingCount = deliveries.filter(
    (delivery) => delivery.status === "sending",
  ).length;
  const recentFailures = deliveries
    .filter((delivery) => delivery.status === "failed")
    .slice(0, 5);
  const recentBatches = batches.slice(0, 5);
  const todayTotalCount = todayDeliveries.length;
  const healthLabel =
    todayFailedCount > 0
      ? "需要处理失败"
      : sendingCount > 0
        ? "正在发送"
        : pendingCount > 0
          ? "有待发送"
          : "运行正常";
  const HealthIcon = todayFailedCount > 0 ? AlertTriangle : CheckCircle2;

  return (
    <div className="flex flex-col gap-5">
      <section className="overflow-hidden rounded-xl border bg-card/80 shadow-sm">
        <div className="grid gap-0 lg:grid-cols-[minmax(280px,0.9fr)_minmax(0,1.6fr)]">
          <div className="border-b p-5 lg:border-b-0 lg:border-r">
            <div className="flex items-start gap-3">
              <div
                className={cn(
                  "rounded-lg border p-2",
                  todayFailedCount > 0
                    ? "border-destructive/25 bg-destructive/10 text-destructive"
                    : "border-primary/25 bg-primary/10 text-primary",
                )}
              >
                <HealthIcon className="size-5" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-medium text-muted-foreground">
                  邮件系统状态
                </p>
                <h2 className="mt-1 text-xl font-semibold">{healthLabel}</h2>
                <p className="mt-2 max-w-lg text-sm leading-6 text-muted-foreground">
                  今日共处理 {todayTotalCount} 封投递，失败 {todayFailedCount} 封。
                  {emailCenterConfig.realRecipientMode
                    ? "当前发送到真实收件人。"
                    : "当前处于非生产测试重定向模式。"}
                </p>
              </div>
            </div>
          </div>
          <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricBlock label="今日发送" value={todaySentCount} tone="success" />
            <MetricBlock
              label="今日失败"
              value={todayFailedCount}
              tone={todayFailedCount > 0 ? "danger" : "default"}
            />
            <MetricBlock
              label="待发送"
              value={pendingCount}
              tone={pendingCount > 0 ? "warning" : "default"}
            />
            <MetricBlock
              label="发送中"
              value={sendingCount}
              tone={sendingCount > 0 ? "warning" : "default"}
            />
          </div>
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
        <section className="overflow-hidden rounded-xl border bg-card/80 shadow-sm">
          <div className="flex items-start justify-between gap-3 border-b p-5">
            <div>
              <h2 className="text-base font-semibold">最近发送任务</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                最近批量任务和当前处理状态。
              </p>
            </div>
            <Clock3 className="mt-1 size-5 text-muted-foreground" />
          </div>
          <div className="flex flex-col gap-3 p-4">
            {recentBatches.length === 0 ? (
              <EmptyPanel>暂无邮件发送任务。</EmptyPanel>
            ) : (
              recentBatches.map((batch) => (
                <div
                  key={batch.id}
                  className="grid gap-3 rounded-lg border bg-background/45 p-3 transition-colors hover:bg-background/70 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{batch.flowTitle}</p>
                    <p className="mt-1 truncate text-xs text-muted-foreground">
                      {batch.subject}
                    </p>
                  </div>
                  <Badge variant="outline" className={getBatchStatusBadgeClass(batch.status)}>
                    {batchStatusText[batch.status]}
                  </Badge>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="overflow-hidden rounded-xl border bg-card/80 shadow-sm">
          <div className="flex items-start justify-between gap-3 border-b p-5">
            <div>
              <h2 className="text-base font-semibold">最近失败</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                优先处理可重试或配置类问题。
              </p>
            </div>
            <AlertTriangle className="mt-1 size-5 text-muted-foreground" />
          </div>
          <div className="flex flex-col gap-3 p-4">
            {recentFailures.length === 0 ? (
              <EmptyPanel>暂无失败记录。</EmptyPanel>
            ) : (
              recentFailures.map((delivery) => (
                <div
                  key={delivery.id}
                  className="rounded-lg border border-l-4 border-l-destructive/70 bg-background/45 p-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{delivery.subject}</p>
                      <p className="mt-1 truncate font-mono text-xs text-muted-foreground">
                        {delivery.toAddress}
                      </p>
                    </div>
                    <Badge
                      variant="outline"
                      className={getDeliveryStatusBadgeClass(delivery.status)}
                    >
                      {deliveryStatusText[delivery.status] ?? delivery.status}
                    </Badge>
                  </div>
                  {delivery.errorMessage && (
                    <p className="mt-3 break-words rounded-md bg-destructive/5 px-2 py-1.5 text-xs text-destructive">
                      {delivery.errorMessage}
                    </p>
                  )}
                </div>
              ))
            )}
          </div>
        </section>
      </div>

      <section className="overflow-hidden rounded-xl border bg-card/80 shadow-sm">
        <div className="flex items-start justify-between gap-3 border-b p-5">
          <div>
            <h2 className="text-base font-semibold">服务状态</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              第一阶段仅展示邮件中心可读配置，不显示敏感信息。
            </p>
          </div>
          <Server className="mt-1 size-5 text-muted-foreground" />
        </div>
        <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricBlock
            label="SMTP"
            value={emailCenterConfig.smtpConfigured ? "已配置" : "未配置"}
            detail={emailCenterConfig.smtpHost}
            tone={emailCenterConfig.smtpConfigured ? "success" : "danger"}
          />
          <MetricBlock
            label="队列"
            value="邮件队列"
            detail={emailCenterConfig.queueStatus}
          />
          <MetricBlock
            label="收件人模式"
            value={emailCenterConfig.realRecipientMode ? "真实收件人" : "测试重定向"}
          />
          <MetricBlock
            label="测试收件人"
            value="默认测试邮箱"
            detail={emailCenterConfig.testRecipient}
          />
        </div>
      </section>
    </div>
  );
}

export function EmailConfigSection({
  emailCenterConfig,
}: {
  emailCenterConfig: EmailCenterConfig;
}) {
  const rows = [
    ["SMTP", emailCenterConfig.smtpConfigured ? "已配置" : "未配置"],
    ["SMTP host", emailCenterConfig.smtpHost],
    ["发件人", emailCenterConfig.sender],
    ["测试收件人", emailCenterConfig.testRecipient],
    ["队列状态", emailCenterConfig.queueStatus],
    ["生产环境真实收件人", emailCenterConfig.realRecipientMode ? "启用" : "未启用"],
  ];

  return (
    <section className="overflow-hidden rounded-xl border bg-card/80 shadow-sm">
      <div className="flex items-start justify-between gap-3 border-b p-5">
        <div>
          <h2 className="text-lg font-semibold">配置</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            第一阶段只展示只读配置状态，敏感信息不会明文展示。
          </p>
        </div>
        <ShieldCheck className="mt-1 size-5 text-muted-foreground" />
      </div>
      <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3">
        {rows.map(([label, value]) => (
          <ConfigItem key={label} label={label} value={value} />
        ))}
      </div>
    </section>
  );
}
