"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  AlertTriangle,
  CheckCircle2,
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
  const healthLabel =
    todayFailedCount > 0
      ? "有发送失败"
      : pendingOrSending > 0
        ? "发送中"
        : "正常";
  const HealthIcon = todayFailedCount > 0 ? AlertTriangle : CheckCircle2;

  return (
    <section className="overflow-hidden rounded-lg border bg-card">
      <div className="flex flex-col gap-3 border-b px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div className="flex items-center gap-2.5">
          <HealthIcon
            className={cn(
              "size-4 shrink-0",
              todayFailedCount > 0 ? "text-destructive" : "text-primary",
            )}
          />
          <div>
            <p className="text-sm font-semibold">{healthLabel}</p>
            <p className="text-xs text-muted-foreground">
              今日成功 {todaySentCount}
              {todayFailedCount > 0 ? ` · 失败 ${todayFailedCount}` : ""}
              {pendingOrSending > 0 ? ` · 进行中 ${pendingOrSending}` : ""}
              {" · "}
              {emailCenterConfig.realRecipientMode ? "正式发送" : "测试模式"}
            </p>
          </div>
        </div>
        {todayFailedCount > 0 && (
          <Button asChild variant="outline" size="sm">
            <Link href="/dashboard/emails?tab=records&status=failed">
              查看失败
            </Link>
          </Button>
        )}
      </div>

      <div className="px-4 py-3 sm:px-5">
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="text-xs font-medium text-muted-foreground">失败待处理</p>
          <Button asChild variant="ghost" size="sm" className="h-7 px-2 text-xs">
            <Link href="/dashboard/emails?tab=records">全部记录</Link>
          </Button>
        </div>
        {recentFailures.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            没有失败记录
          </p>
        ) : (
          <div className="flex flex-col divide-y">
            {recentFailures.map((delivery) => (
              <div
                key={delivery.id}
                className="flex items-start justify-between gap-3 px-3 py-2.5"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {delivery.subject}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {delivery.userName || "未知收件人"}
                    {delivery.errorMessage ? ` · ${delivery.errorMessage}` : ""}
                  </p>
                </div>
                <Badge
                  variant="outline"
                  className={getDeliveryStatusBadgeClass(delivery.status)}
                >
                  {deliveryStatusText[delivery.status] ?? delivery.status}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

export function EmailConfigSection({
  emailCenterConfig,
}: {
  emailCenterConfig: EmailCenterConfig;
}) {
  const rows: Array<[string, string]> = [
    ["发信服务", emailCenterConfig.smtpConfigured ? "已就绪" : "未配置"],
    ["收件模式", emailCenterConfig.realRecipientMode ? "正式发送" : "测试重定向"],
    ["发件人", emailCenterConfig.sender || "—"],
    ["测试收件人", emailCenterConfig.testRecipient || "—"],
  ];
  const problemChecks = emailCenterConfig.readinessChecks.filter(
    (check) => check.status !== "pass",
  );

  return (
    <section className="overflow-hidden rounded-lg border bg-card">
      <div className="border-b px-4 py-3 sm:px-5">
        <h2 className="text-sm font-semibold">环境</h2>
      </div>
      <div className="grid gap-px border-b bg-border sm:grid-cols-2 lg:grid-cols-4">
        {rows.map(([label, value]) => (
          <div key={label} className="bg-card px-4 py-3">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="mt-1 break-words text-sm font-medium">{value}</p>
          </div>
        ))}
      </div>
      {problemChecks.length > 0 ? (
        <div className="space-y-2 p-4">
          <p className="text-xs font-medium text-muted-foreground">待处理检查</p>
          {problemChecks.map((check) => {
            const Icon = AlertTriangle;
            return (
              <div
                key={check.key}
                className={cn(
                  "flex items-start gap-2 rounded-lg border p-3",
                  getReadinessClass(check.status),
                )}
              >
                <Icon className="mt-0.5 size-4 shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-medium">{check.label}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {check.detail}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="flex items-center gap-2 px-4 py-3 text-sm text-muted-foreground">
          <CheckCircle2 className="size-4 text-primary" />
          就绪检查已通过
        </p>
      )}
    </section>
  );
}
