"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PaginationComponent } from "@/components/ui/pagination";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search } from "lucide-react";

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
  const [status, setStatus] = useState(filters.status || "all");
  const [category, setCategory] = useState(filters.category || "all");
  const [flowId, setFlowId] = useState(filters.flowId || "all");

  useEffect(() => {
    setStatus(filters.status || "all");
    setCategory(filters.category || "all");
    setFlowId(filters.flowId || "all");
  }, [filters.status, filters.category, filters.flowId]);
  const start =
    deliveryPage.totalCount === 0
      ? 0
      : (filters.page - 1) * filters.pageSize + 1;
  const end = Math.min(
    filters.page * filters.pageSize,
    deliveryPage.totalCount,
  );

  return (
    <section className="overflow-hidden rounded-lg border bg-card">
      <div className="border-b px-4 py-3 sm:px-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold">发送记录</h2>
          <p className="text-xs text-muted-foreground tabular-nums">
            {start}-{end} / {deliveryPage.totalCount}
          </p>
        </div>

        <form
          action="/dashboard/emails"
          className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center"
        >
          <input type="hidden" name="tab" value="records" />
          <input type="hidden" name="page" value="1" />
          <input type="hidden" name="pageSize" value={filters.pageSize} />
          <input type="hidden" name="status" value={status === "all" ? "" : status} />
          <input type="hidden" name="category" value={category === "all" ? "" : category} />
          <input type="hidden" name="flowId" value={flowId === "all" ? "" : flowId} />

          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger
              id="email-record-status"
            aria-label="状态"
              className="h-9 sm:w-28"
            >
              <SelectValue placeholder="状态" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">状态</SelectItem>
            {Object.entries(deliveryStatusText).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                {label}
                </SelectItem>
            ))}
            </SelectContent>
          </Select>

          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger
              id="email-record-category"
            aria-label="类型"
              className="h-9 sm:w-28"
            >
              <SelectValue placeholder="类型" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">类型</SelectItem>
            {Object.entries(emailCategoryText).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                {label}
                </SelectItem>
            ))}
            </SelectContent>
          </Select>

          <Select value={flowId} onValueChange={setFlowId}>
            <SelectTrigger
              id="email-record-flow"
            aria-label="流程"
              className="h-9 min-w-0 sm:max-w-[12rem]"
            >
              <SelectValue placeholder="流程" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">流程</SelectItem>
            {flowTargets.map((flow) => (
                <SelectItem key={flow.id} value={String(flow.id)}>
                {flow.title}
                </SelectItem>
            ))}
            </SelectContent>
          </Select>

          <div className="relative min-w-0 flex-1 sm:max-w-xs">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="email-record-query"
              name="query"
              defaultValue={filters.query}
              placeholder="搜索姓名、邮箱、主题"
              className="h-9 pl-8"
              aria-label="搜索"
            />
          </div>

          <div className="flex gap-2">
            <Button type="submit" size="sm">
              筛选
            </Button>
            <Button asChild variant="ghost" size="sm">
              <Link href="/dashboard/emails?tab=records">重置</Link>
            </Button>
          </div>
        </form>
      </div>

      <div className="flex flex-col divide-y">
        {deliveries.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted-foreground">
            暂无记录
          </p>
        ) : (
          deliveries.map((delivery: EmailDeliveryRecord) => (
            <article
              key={delivery.id}
              className="flex flex-col gap-2 px-4 py-3 sm:px-5 lg:flex-row lg:items-center lg:justify-between"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge
                    variant="outline"
                    className={getDeliveryStatusBadgeClass(delivery.status)}
                  >
                    {deliveryStatusText[delivery.status] ?? delivery.status}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {emailCategoryText[delivery.category] ?? delivery.category}
                    {" · "}
                    {templateLabel(delivery.templateKey, templateDefinitions)}
                  </span>
                </div>
                <p className="mt-1 truncate text-sm font-medium">
                  {delivery.subject}
                </p>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  {delivery.userName || "未知收件人"}
                  {delivery.flowTitle ? ` · ${delivery.flowTitle}` : ""}
                  {" · "}
                  {formatDate(delivery.sentAt ?? delivery.createdAt)}
                </p>
                {delivery.errorMessage && (
                  <p className="mt-1 truncate text-xs text-destructive">
                    {delivery.errorMessage}
                  </p>
                )}
              </div>
              <div className="shrink-0">
                <EmailRecordActions delivery={delivery} compact />
              </div>
            </article>
          ))
        )}
      </div>

      {deliveryPage.totalPages > 1 && (
        <div className="border-t p-3">
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
