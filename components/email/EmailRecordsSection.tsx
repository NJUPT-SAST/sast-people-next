"use client";

import Link from "next/link";

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

function getRecordAccentClass(status: string) {
  if (status === "failed" || status === "dead") return "border-l-destructive/70";
  if (status === "sent") return "border-l-primary/70";
  if (status === "sending") return "border-l-chart-3/70";
  return "border-l-muted-foreground/40";
}

function templateLabel(
  key: string,
  definitions: EmailTemplateDefinition[],
) {
  return definitions.find((item) => item.key === key)?.name ?? key;
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
  const start =
    deliveryPage.totalCount === 0
      ? 0
      : (filters.page - 1) * filters.pageSize + 1;
  const end = Math.min(
    filters.page * filters.pageSize,
    deliveryPage.totalCount,
  );

  return (
    <section className="overflow-hidden rounded-xl border bg-card/80 shadow-sm">
      <div className="border-b px-4 py-4 sm:px-5">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-base font-semibold">发送记录</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              查找每一封邮件，失败后可重试。
            </p>
          </div>
          <p className="text-xs text-muted-foreground">
            {start}-{end} / 共 {deliveryPage.totalCount} 条
          </p>
        </div>

        <form
          action="/dashboard/emails"
          className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
        >
          <input type="hidden" name="tab" value="records" />
          <input type="hidden" name="page" value="1" />
          <input type="hidden" name="pageSize" value={filters.pageSize} />

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
            <Label htmlFor="email-record-category" className="text-xs text-muted-foreground">
              类型
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
            <Label htmlFor="email-record-query" className="text-xs text-muted-foreground">
              搜索
            </Label>
            <Input
              id="email-record-query"
              name="query"
              defaultValue={filters.query}
              placeholder="姓名、邮箱、主题…"
              className="h-9"
            />
          </div>

          <div className="flex gap-2 sm:col-span-2 lg:col-span-4">
            <Button type="submit" size="sm">
              <Search data-icon="inline-start" />
              筛选
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href="/dashboard/emails?tab=records">
                <RotateCcw data-icon="inline-start" />
                重置
              </Link>
            </Button>
          </div>
        </form>
      </div>

      <div className="flex flex-col divide-y">
        {deliveries.length === 0 ? (
          <div className="p-10 text-center">
            <p className="text-sm font-medium">暂无记录</p>
            <p className="mt-1 text-sm text-muted-foreground">
              发送结果通知或测试邮件后，会出现在这里。
            </p>
          </div>
        ) : (
          deliveries.map((delivery: EmailDeliveryRecord) => (
            <article
              key={delivery.id}
              className={cn(
                "border-l-4 px-4 py-4 sm:px-5",
                getRecordAccentClass(delivery.status),
              )}
            >
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0 flex-1 space-y-1.5">
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
                    <span className="text-xs text-muted-foreground">
                      {templateLabel(delivery.templateKey, templateDefinitions)}
                    </span>
                  </div>
                  <p className="break-words text-sm font-medium leading-5">
                    {delivery.subject}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    <span className="text-foreground">
                      {delivery.userName || "未知收件人"}
                    </span>
                    {delivery.toAddress ? ` · ${delivery.toAddress}` : ""}
                    {delivery.flowTitle ? ` · ${delivery.flowTitle}` : ""}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatDate(delivery.sentAt ?? delivery.createdAt)}
                  </p>
                  {delivery.errorMessage && (
                    <p className="mt-1 rounded-md bg-destructive/10 px-2.5 py-1.5 text-xs text-destructive">
                      {delivery.errorMessage}
                    </p>
                  )}
                </div>
                <div className="shrink-0">
                  <EmailRecordActions delivery={delivery} compact />
                </div>
              </div>
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
