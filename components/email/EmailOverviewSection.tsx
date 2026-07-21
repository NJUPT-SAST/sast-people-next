"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ClipboardList,
  FileText,
  ListChecks,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";

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

function getReadinessClass(status: "pass" | "warn" | "fail") {
  if (status === "pass") return "border-primary/25 bg-primary/5 text-primary";
  if (status === "fail") {
    return "border-destructive/25 bg-destructive/5 text-destructive";
  }
  return "border-chart-3/25 bg-chart-3/5 text-chart-3";
}

function QuickAction({
  href,
  title,
  description,
  icon: Icon,
  emphasize,
}: {
  href: string;
  title: string;
  description: string;
  icon: typeof ListChecks;
  emphasize?: boolean;
}) {
  return (
    <Button
      asChild
      variant="outline"
      className={cn(
        "h-auto justify-start whitespace-normal rounded-xl border bg-background/50 px-4 py-3 text-left shadow-none hover:bg-background",
        emphasize && "border-primary/30 bg-primary/5 hover:bg-primary/10",
      )}
    >
      <Link href={href}>
        <div className="flex w-full items-start gap-3">
          <div
            className={cn(
              "mt-0.5 rounded-lg border p-2",
              emphasize
                ? "border-primary/25 bg-primary/10 text-primary"
                : "border-border bg-muted/40 text-muted-foreground",
            )}
          >
            <Icon className="size-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-foreground">{title}</span>
              <ArrowRight className="size-3.5 text-muted-foreground" />
            </div>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              {description}
            </p>
          </div>
        </div>
      </Link>
    </Button>
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
    (delivery) => delivery.status === "failed" || delivery.status === "dead",
  ).length;
  const pendingCount = deliveries.filter(
    (delivery) => delivery.status === "pending",
  ).length;
  const sendingCount = deliveries.filter(
    (delivery) => delivery.status === "sending",
  ).length;
  const recentFailures = deliveries
    .filter((delivery) => delivery.status === "failed" || delivery.status === "dead")
    .slice(0, 5);
  const recentBatches = batches.slice(0, 5);
  const todayTotalCount = todayDeliveries.length;
  const healthLabel =
    todayFailedCount > 0
      ? "有失败需要处理"
      : sendingCount > 0
        ? "正在发送中"
        : pendingCount > 0
          ? "还有待发送邮件"
          : "运行正常";
  const HealthIcon = todayFailedCount > 0 ? AlertTriangle : CheckCircle2;

  return (
    <div className="flex flex-col gap-5">
      <section className="overflow-hidden rounded-xl border bg-card/80 shadow-sm">
        <div className="grid gap-0 lg:grid-cols-[minmax(280px,0.95fr)_minmax(0,1.55fr)]">
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
                  今天邮件状态
                </p>
                <h2 className="mt-1 text-xl font-semibold">{healthLabel}</h2>
                <p className="mt-2 max-w-lg text-sm leading-6 text-muted-foreground">
                  今日共 {todayTotalCount} 封，成功 {todaySentCount} 封，失败{" "}
                  {todayFailedCount} 封。
                  {emailCenterConfig.realRecipientMode
                    ? "当前会发到真实收件人。"
                    : "当前是本地测试模式，实际会重定向到测试邮箱。"}
                </p>
              </div>
            </div>
          </div>
          <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricBlock label="今日已发送" value={todaySentCount} tone="success" />
            <MetricBlock
              label="今日失败"
              value={todayFailedCount}
              tone={todayFailedCount > 0 ? "danger" : "default"}
            />
            <MetricBlock
              label="排队待发"
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

      <section className="overflow-hidden rounded-xl border bg-card/80 shadow-sm">
        <div className="border-b px-5 py-4">
          <h2 className="text-base font-semibold">接下来做什么</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            快捷入口。日常发结果通知请直接用顶部「发结果通知」页签。
          </p>
        </div>
        <div className="grid gap-3 p-4 md:grid-cols-3">
          <QuickAction
            href="/dashboard/emails?tab=tasks"
            title="发结果通知"
            description="选招新流程，给通过/不通过名单发邮件。"
            icon={ListChecks}
            emphasize={todayFailedCount === 0}
          />
          <QuickAction
            href="/dashboard/emails?tab=records"
            title={todayFailedCount > 0 ? "处理失败记录" : "查发送记录"}
            description={
              todayFailedCount > 0
                ? "查看失败原因，并重试可恢复的邮件。"
                : "按收件人、状态或流程查找每一封邮件。"
            }
            icon={ClipboardList}
            emphasize={todayFailedCount > 0}
          />
          <QuickAction
            href="/dashboard/emails?tab=templates"
            title="改邮件文案"
            description="编辑结果通知、面试通知模板，并可测试发送。"
            icon={FileText}
          />
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
        <section className="overflow-hidden rounded-xl border bg-card/80 shadow-sm">
          <div className="flex items-start justify-between gap-3 border-b p-5">
            <div>
              <h2 className="text-base font-semibold">最近批量任务</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                结果通知批量发送的最近记录。
              </p>
            </div>
            <Button asChild variant="ghost" size="sm" className="shrink-0">
              <Link href="/dashboard/emails?tab=tasks">查看全部</Link>
            </Button>
          </div>
          <div className="flex flex-col gap-3 p-4">
            {recentBatches.length === 0 ? (
              <EmptyPanel>还没有批量发送任务。去「发结果通知」创建第一个。</EmptyPanel>
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
                    {batchStatusText[batch.status] ?? batch.status}
                  </Badge>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="overflow-hidden rounded-xl border bg-card/80 shadow-sm">
          <div className="flex items-start justify-between gap-3 border-b p-5">
            <div>
              <h2 className="text-base font-semibold">需要关注的失败</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                优先处理可重试或配置问题。
              </p>
            </div>
            <Button asChild variant="ghost" size="sm" className="shrink-0">
              <Link href="/dashboard/emails?tab=records&status=failed">查看记录</Link>
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
                      <p className="truncate text-sm font-semibold">{delivery.subject}</p>
                      <p className="mt-1 truncate text-xs text-muted-foreground">
                        {delivery.userName || "未知收件人"} · {delivery.toAddress}
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
    ["回执入口", emailCenterConfig.webhookConfigured ? "已配置" : "未配置"],
    ["发送限速", `${emailCenterConfig.sendRateLimitPerMinute} 封/分钟`],
    [
      "自动重试",
      `${emailCenterConfig.retryMaxAttempts} 次，扫描 ${emailCenterConfig.retryScanLimit} 封/轮`,
    ],
    ["尝试日志保留", `${emailCenterConfig.attemptRetentionDays} 天`],
  ];

  return (
    <section className="overflow-hidden rounded-xl border bg-card/80 shadow-sm">
      <div className="flex items-start justify-between gap-3 border-b p-5">
        <div>
          <h2 className="text-lg font-semibold">运行配置</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            这里只读展示当前环境配置，改配置请走部署/环境变量，不会在页面明文显示密钥。
          </p>
        </div>
        <ShieldCheck className="mt-1 size-5 text-muted-foreground" />
      </div>
      <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3">
        {rows.map(([label, value]) => (
          <ConfigItem key={label} label={label} value={value} />
        ))}
      </div>
      <div className="border-t p-4">
        <h3 className="text-sm font-semibold">上线前检查</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          通过项表示当前环境满足该项要求；未通过需要先修环境再发正式邮件。
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
