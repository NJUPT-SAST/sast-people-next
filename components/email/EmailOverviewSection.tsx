"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  AlertTriangle,
  CheckCircle2,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";

import {
  deliveryStatusText,
  getDeliveryStatusBadgeClass,
  isToday,
} from "./emailDashboardConstants";
import type {
  EmailCenterConfig,
  EmailDeliveryRecord,
} from "./emailDashboardTypes";

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
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg border bg-background/45 p-4">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-2 break-words text-sm font-semibold">{value}</p>
    </div>
  );
}

function getReadinessClass(status: "pass" | "warn" | "fail") {
  if (status === "pass") return "border-primary/25 bg-primary/5 text-primary";
  if (status === "fail") {
    return "border-destructive/25 bg-destructive/5 text-destructive";
  }
  return "border-chart-3/25 bg-chart-3/5 text-chart-3";
}

export function EmailOverviewSection({
  deliveries,
  emailCenterConfig,
}: {
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
    (delivery) => delivery.status === "failed" || delivery.status === "dead",
  ).length;
  const pendingOrSending = deliveries.filter(
    (delivery) =>
      delivery.status === "pending" || delivery.status === "sending",
  ).length;
  const recentFailures = deliveries
    .filter(
      (delivery) =>
        delivery.status === "failed" || delivery.status === "dead",
    )
    .slice(0, 5);
  const todayTotalCount = todayDeliveries.length;
  const healthLabel =
    todayFailedCount > 0
      ? "有邮件发送失败"
      : pendingOrSending > 0
        ? "有邮件正在发送"
        : "运行正常";
  const HealthIcon = todayFailedCount > 0 ? AlertTriangle : CheckCircle2;

  return (
    <div className="flex flex-col gap-5">
      <section className="overflow-hidden rounded-xl border bg-card/80 shadow-sm">
        <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start sm:justify-between">
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
              <p className="text-xs font-medium text-muted-foreground">今日概况</p>
              <h2 className="mt-1 text-xl font-semibold">{healthLabel}</h2>
              <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
                今日 {todayTotalCount} 封 · 成功 {todaySentCount}
                {todayFailedCount > 0 ? ` · 失败 ${todayFailedCount}` : ""}
                {pendingOrSending > 0 ? ` · 进行中 ${pendingOrSending}` : ""}
                。
                {emailCenterConfig.realRecipientMode
                  ? "当前发往真实收件人。"
                  : "当前为测试模式，会重定向到测试邮箱。"}
              </p>
            </div>
          </div>
          {todayFailedCount > 0 && (
            <Button asChild variant="outline" size="sm" className="shrink-0">
              <Link href="/dashboard/emails?tab=records&status=failed">
                查看失败
              </Link>
            </Button>
          )}
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border bg-card/80 shadow-sm">
        <div className="flex items-start justify-between gap-3 border-b px-5 py-4">
          <div>
            <h2 className="text-base font-semibold">需要处理</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              发送失败的邮件会出现在这里，可到发送记录中重试。
            </p>
          </div>
          <Button asChild variant="ghost" size="sm" className="shrink-0">
            <Link href="/dashboard/emails?tab=records">全部记录</Link>
          </Button>
        </div>
        <div className="flex flex-col gap-3 p-4">
          {recentFailures.length === 0 ? (
            <EmptyPanel>最近没有失败记录。</EmptyPanel>
          ) : (
            recentFailures.map((delivery) => (
              <div
                key={delivery.id}
                className="rounded-lg border border-l-4 border-l-destructive/70 bg-background/45 p-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">
                      {delivery.subject}
                    </p>
                    <p className="mt-1 truncate text-xs text-muted-foreground">
                      {delivery.userName || "未知收件人"}
                      {delivery.toAddress ? ` · ${delivery.toAddress}` : ""}
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
  );
}

export function EmailConfigSection({
  emailCenterConfig,
}: {
  emailCenterConfig: EmailCenterConfig;
}) {
  const rows = [
    ["发信服务", emailCenterConfig.smtpConfigured ? "已就绪" : "未配置"],
    ["服务器", emailCenterConfig.smtpHost || "—"],
    ["发件人", emailCenterConfig.sender || "—"],
    ["测试收件人", emailCenterConfig.testRecipient || "—"],
    ["收件模式", emailCenterConfig.realRecipientMode ? "正式发送" : "测试重定向"],
    ["发送队列", emailCenterConfig.queueStatus || "—"],
    ["发送限速", `${emailCenterConfig.sendRateLimitPerMinute} 封/分钟`],
    ["失败重试", `最多 ${emailCenterConfig.retryMaxAttempts} 次`],
  ];

  return (
    <section className="overflow-hidden rounded-xl border bg-card/80 shadow-sm">
      <div className="flex items-start justify-between gap-3 border-b p-5">
        <div>
          <h2 className="text-base font-semibold">环境信息</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            只读查看当前环境；配置变更请走部署流程。
          </p>
        </div>
        <ShieldCheck className="mt-1 size-5 text-muted-foreground" />
      </div>
      <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-4">
        {rows.map(([label, value]) => (
          <ConfigItem key={label} label={label} value={value} />
        ))}
      </div>
      <div className="border-t p-4">
        <h3 className="text-sm font-semibold">就绪检查</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          正式发送前请确认以下项均已通过。
        </p>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          {emailCenterConfig.readinessChecks.map((check) => {
            const Icon = check.status === "pass" ? CheckCircle2 : AlertTriangle;
            return (
              <div
                key={check.key}
                className={cn(
                  "rounded-lg border p-4",
                  getReadinessClass(check.status),
                )}
              >
                <div className="flex items-start gap-3">
                  <Icon className="mt-0.5 size-4 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">{check.label}</p>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      {check.detail}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
