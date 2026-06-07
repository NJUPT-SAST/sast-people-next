"use client";

import Link from "next/link";
import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PaginationComponent } from "@/components/ui/pagination";
import { cn } from "@/lib/utils";
import { RotateCcw, Search } from "lucide-react";

import {
  deliveryStatusText,
  emailCategoryText,
  formatDate,
  getDeliveryStatusBadgeClass,
} from "./emailDashboardConstants";
import { EmailRecordActions } from "./EmailRecordActions";
import type {
  EmailDeliveryPage,
  EmailDeliveryRecord,
  EmailTemplateDefinition,
  FlowTarget,
} from "./emailDashboardTypes";

function getDeliverySource(delivery: EmailDeliveryRecord) {
  return delivery.flowTitle ?? delivery.batchName ?? "";
}

function getRelatedObjectText(delivery: EmailDeliveryRecord) {
  if (delivery.relatedScheduleId) {
    return `面试预约 #${delivery.relatedScheduleId}`;
  }
  if (delivery.userFlowId) {
    return `报名记录 #${delivery.userFlowId}`;
  }
  if (delivery.batchId) {
    return `批量任务 #${delivery.batchId}`;
  }
  return "-";
}

function getRecordAccentClass(status: string) {
  if (status === "failed") return "border-l-destructive/70";
  if (status === "sent") return "border-l-primary/70";
  if (status === "sending") return "border-l-chart-3/70";
  return "border-l-muted-foreground/40";
}

function getTemplateOptions({
  deliveries,
  templateDefinitions,
}: {
  deliveries: EmailDeliveryRecord[];
  templateDefinitions: EmailTemplateDefinition[];
}) {
  return Array.from(
    new Set([
      ...templateDefinitions.map((definition) => definition.key),
      ...deliveries.map((delivery) => delivery.templateKey),
    ]),
  ).sort((a, b) => a.localeCompare(b, "zh-CN"));
}

function RecordInfo({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="mt-1 min-w-0 text-sm">{children}</div>
    </div>
  );
}

export function EmailRecordsSection({
  deliveryPage,
  flowTargets,
  templateDefinitions,
}: {
  deliveryPage: EmailDeliveryPage;
  flowTargets: FlowTarget[];
  templateDefinitions: EmailTemplateDefinition[];
}) {
  const deliveries = Array.isArray(deliveryPage.deliveries)
    ? deliveryPage.deliveries
    : [];
  const filters = deliveryPage.filters;
  const templateOptions = getTemplateOptions({ deliveries, templateDefinitions });
  const start =
    deliveryPage.totalCount === 0
      ? 0
      : (filters.page - 1) * filters.pageSize + 1;
  const end = Math.min(filters.page * filters.pageSize, deliveryPage.totalCount);

  return (
    <section className="overflow-hidden rounded-xl border bg-card/80 shadow-sm">
      <div className="flex flex-col gap-4 border-b p-4 lg:p-5">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 className="text-lg font-semibold">发送记录</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              结果通知、面试通知和测试邮件都会记录在这里。
            </p>
          </div>
          <p className="rounded-md border bg-background/60 px-2.5 py-1 text-sm text-muted-foreground">
            显示 {start} - {end}，共 {deliveryPage.totalCount} 条
          </p>
        </div>

        <form
          action="/dashboard/emails"
          className="grid gap-3 rounded-lg border bg-background/35 p-3 md:grid-cols-2 xl:grid-cols-[160px_160px_minmax(220px,1fr)_minmax(220px,1fr)]"
        >
          <input type="hidden" name="tab" value="records" />
          <div className="flex min-w-0 flex-col gap-1.5">
            <Label htmlFor="email-record-category" className="text-xs text-muted-foreground">
              邮件类型
            </Label>
            <select
              id="email-record-category"
              name="category"
              defaultValue={filters.category}
              className="h-9 rounded-md border bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              <option value="">全部类型</option>
              {Object.entries(emailCategoryText).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex min-w-0 flex-col gap-1.5">
            <Label htmlFor="email-record-status" className="text-xs text-muted-foreground">
              状态
            </Label>
            <select
              id="email-record-status"
              name="status"
              defaultValue={filters.status}
              className="h-9 rounded-md border bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              <option value="">全部状态</option>
              {Object.entries(deliveryStatusText).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex min-w-0 flex-col gap-1.5">
            <Label htmlFor="email-record-template" className="text-xs text-muted-foreground">
              模板
            </Label>
            <select
              id="email-record-template"
              name="templateKey"
              defaultValue={filters.templateKey}
              className="h-9 rounded-md border bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              <option value="">全部模板</option>
              {templateOptions.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </div>
          <div className="flex min-w-0 flex-col gap-1.5">
            <Label htmlFor="email-record-flow" className="text-xs text-muted-foreground">
              流程
            </Label>
            <select
              id="email-record-flow"
              name="flowId"
              defaultValue={filters.flowId}
              className="h-9 rounded-md border bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              <option value="">全部流程</option>
              {flowTargets.map((flow) => (
                <option key={flow.id} value={flow.id}>
                  {flow.title}
                </option>
              ))}
            </select>
          </div>
          <div className="flex min-w-0 flex-col gap-1.5">
            <Label htmlFor="email-record-creator" className="text-xs text-muted-foreground">
              创建人 ID
            </Label>
            <Input
              id="email-record-creator"
              name="creatorId"
              defaultValue={filters.creatorId}
              inputMode="numeric"
              placeholder="Link 用户 ID"
            />
          </div>
          <div className="flex min-w-0 flex-col gap-1.5">
            <Label htmlFor="email-record-from" className="text-xs text-muted-foreground">
              开始日期
            </Label>
            <Input
              id="email-record-from"
              name="from"
              type="date"
              defaultValue={filters.from}
            />
          </div>
          <div className="flex min-w-0 flex-col gap-1.5">
            <Label htmlFor="email-record-to" className="text-xs text-muted-foreground">
              结束日期
            </Label>
            <Input
              id="email-record-to"
              name="to"
              type="date"
              defaultValue={filters.to}
            />
          </div>
          <div className="flex min-w-0 flex-col gap-1.5">
            <Label htmlFor="email-record-query" className="text-xs text-muted-foreground">
              收件人/关键字
            </Label>
            <Input
              id="email-record-query"
              name="query"
              defaultValue={filters.query}
              placeholder="搜索收件人、主题、模板或失败原因"
            />
          </div>
          <div className="flex gap-2 md:col-span-2 xl:col-span-4">
            <Button type="submit">
              <Search data-icon="inline-start" />
              筛选
            </Button>
            <Button asChild variant="outline">
              <Link href="/dashboard/emails?tab=records">
                <RotateCcw data-icon="inline-start" />
                重置
              </Link>
            </Button>
          </div>
        </form>
      </div>

      <div className="flex flex-col gap-3 p-4 lg:p-5">
        {deliveries.length === 0 ? (
          <div className="rounded-lg border border-dashed bg-background/30 p-10 text-center">
            <p className="text-sm font-medium">暂无邮件记录</p>
            <p className="mt-1 text-sm text-muted-foreground">
              发送测试邮件或创建结果通知任务后，这里会显示投递快照和状态。
            </p>
          </div>
        ) : (
          deliveries.map((delivery) => (
            <article
              key={delivery.id}
              className={cn(
                "rounded-lg border border-l-4 bg-background/45 p-3 transition-colors hover:bg-background/70 lg:p-4",
                getRecordAccentClass(delivery.status),
              )}
            >
              <div className="grid gap-4 xl:grid-cols-[minmax(220px,1.2fr)_minmax(220px,1fr)_minmax(200px,0.9fr)_minmax(160px,0.7fr)_auto] xl:items-center">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge
                      variant="outline"
                      className={getDeliveryStatusBadgeClass(delivery.status)}
                    >
                      {deliveryStatusText[delivery.status] ?? delivery.status}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {emailCategoryText[delivery.category] ?? delivery.category}
                    </span>
                  </div>
                  <p className="mt-2 break-words text-sm font-semibold leading-5">
                    {delivery.subject}
                  </p>
                  <p className="mt-1 truncate font-mono text-xs text-muted-foreground">
                    {delivery.templateKey}
                  </p>
                </div>

                <RecordInfo label="收件人">
                  <p className="truncate font-mono text-xs">{delivery.toAddress}</p>
                  <p className="mt-1 truncate text-xs text-muted-foreground">
                    {delivery.userName}
                    {delivery.studentId ? ` · ${delivery.studentId}` : ""}
                  </p>
                </RecordInfo>

                <RecordInfo label="关联对象">
                  <p className="truncate font-medium">
                    {getDeliverySource(delivery) || "-"}
                  </p>
                  <p className="mt-1 truncate text-xs text-muted-foreground">
                    {getRelatedObjectText(delivery)}
                  </p>
                </RecordInfo>

                <RecordInfo label="时间">
                  <p className="truncate text-xs text-muted-foreground">
                    创建 {formatDate(delivery.createdAt)}
                  </p>
                  <p className="mt-1 truncate text-xs text-muted-foreground">
                    发送 {formatDate(delivery.sentAt)}
                  </p>
                </RecordInfo>

                <div className="flex flex-col gap-3 xl:items-end">
                  <p className="text-xs text-muted-foreground">
                    创建人：{delivery.createdByName ?? "-"}
                    {delivery.createdById ? ` #${delivery.createdById}` : ""}
                  </p>
                  <EmailRecordActions delivery={delivery} compact />
                </div>
              </div>
              {delivery.errorMessage && (
                <div className="mt-3 rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                  {delivery.errorMessage}
                </div>
              )}
            </article>
          ))
        )}
      </div>

      {deliveryPage.totalPages > 1 && (
        <div className="border-t p-4">
          <PaginationComponent
            totalItems={deliveryPage.totalCount}
            pageSize={filters.pageSize}
            currentPage={filters.page}
          />
        </div>
      )}
    </section>
  );
}
