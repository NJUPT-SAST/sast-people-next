import Link from "next/link";
import { Search, RotateCcw } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PaginationComponent } from "@/components/ui/pagination";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import originalDayjs from "@/lib/dayjs";
import type { listOperationAudit } from "@/lib/operation-audit-list";

type AuditLogResult = Awaited<ReturnType<typeof listOperationAudit>>;
type AuditLogItem = AuditLogResult["logs"][number];

const actionLabels: Record<string, string> = {
  "review.score.upsert": "保存评分",
  "review.score.batch_upsert": "批量保存评分",
  "email.batch.create": "创建邮件批次",
  "email.batch.send": "发送邮件批次",
  "flow.create": "创建流程",
  "flow.update": "更新流程",
  "flow.delete": "删除流程",
  "flow.duplicate": "复制流程",
  "user.role.update": "修改角色",
  "user.ban": "禁用用户",
};

function getActionLabel(action: string) {
  return actionLabels[action] ?? action;
}

function formatMetadata(metadata: AuditLogItem["metadata"]) {
  if (!metadata) {
    return "-";
  }

  return JSON.stringify(metadata, null, 2);
}

function AuditLogCard({ item }: { item: AuditLogItem }) {
  return (
    <div className="space-y-3 border-b p-4 last:border-b-0">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{getActionLabel(item.action)}</p>
          <p className="text-xs text-muted-foreground">
            {originalDayjs(item.createdAt).format("YYYY-MM-DD HH:mm:ss")}
          </p>
        </div>
        <Badge variant="outline">{item.resourceType}</Badge>
      </div>
      <div className="grid gap-2 text-sm">
        <div className="flex justify-between gap-3">
          <span className="text-muted-foreground">操作者</span>
          <span className="text-right">
            {item.actorName ?? "未知用户"} #{item.actorId}
          </span>
        </div>
        <div className="flex justify-between gap-3">
          <span className="text-muted-foreground">资源</span>
          <span className="font-mono text-xs">
            {item.resourceType}
            {item.resourceId ? `:${item.resourceId}` : ""}
          </span>
        </div>
      </div>
      <pre className="max-h-36 overflow-y-auto whitespace-pre-wrap break-words rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
        {formatMetadata(item.metadata)}
      </pre>
    </div>
  );
}

export function AuditLogTable({
  logs,
  totalCount,
  filters,
}: Pick<AuditLogResult, "logs" | "totalCount" | "filters">) {
  const safeLogs = Array.isArray(logs) ? logs : [];
  const start = totalCount === 0 ? 0 : (filters.page - 1) * filters.pageSize + 1;
  const end = Math.min(filters.page * filters.pageSize, totalCount);

  return (
    <div className="space-y-4">
      <form
        action="/dashboard/audit"
        className="grid gap-3 rounded-md border bg-card p-4 md:grid-cols-2 xl:grid-cols-[1fr_1fr_1fr_150px_150px_auto]"
      >
        <Input
          name="actor"
          defaultValue={filters.actor}
          placeholder="操作者姓名 / 学号 / ID"
        />
        <Input
          name="action"
          defaultValue={filters.action}
          placeholder="操作类型，例如 review.score.batch_upsert"
        />
        <Input
          name="resourceType"
          defaultValue={filters.resourceType}
          placeholder="资源类型，例如 user_flow"
        />
        <Input type="date" name="from" defaultValue={filters.from} />
        <Input type="date" name="to" defaultValue={filters.to} />
        <div className="flex gap-2">
          <Button type="submit" className="flex-1">
            <Search data-icon="inline-start" />
            筛选
          </Button>
          <Button asChild variant="outline" size="icon" title="重置筛选">
            <Link href="/dashboard/audit">
              <RotateCcw />
            </Link>
          </Button>
        </div>
      </form>

      <div className="rounded-md border bg-card">
        <div className="hidden overflow-x-auto md:block">
          <Table className="min-w-[980px]">
            <TableHeader>
              <TableRow>
                <TableHead className="w-[160px]">时间</TableHead>
                <TableHead className="w-[150px]">操作者</TableHead>
                <TableHead className="w-[190px]">操作</TableHead>
                <TableHead className="w-[150px]">资源</TableHead>
                <TableHead>附加数据</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {safeLogs.length > 0 ? (
                safeLogs.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="whitespace-nowrap font-mono text-xs text-muted-foreground">
                      {originalDayjs(item.createdAt).format("YYYY-MM-DD HH:mm:ss")}
                    </TableCell>
                    <TableCell>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {item.actorName ?? "未知用户"}
                        </p>
                        <p className="font-mono text-xs text-muted-foreground">
                          {item.actorStudentId ?? `#${item.actorId}`}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <span className="text-sm font-medium">
                          {getActionLabel(item.action)}
                        </span>
                        <span className="font-mono text-xs text-muted-foreground">
                          {item.action}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col items-start gap-1">
                        <Badge variant="outline">{item.resourceType}</Badge>
                        {item.resourceId ? (
                          <span className="font-mono text-xs text-muted-foreground">
                            #{item.resourceId}
                          </span>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell>
                      <pre className="max-h-28 overflow-y-auto whitespace-pre-wrap break-words rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
                        {formatMetadata(item.metadata)}
                      </pre>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                    暂无审计记录
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        <div className="md:hidden">
          {safeLogs.length > 0 ? (
            safeLogs.map((item) => <AuditLogCard key={item.id} item={item} />)
          ) : (
            <div className="p-8 text-center text-sm text-muted-foreground">
              暂无审计记录
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          显示 {start} - {end} 共 {totalCount} 条记录
        </p>
        <PaginationComponent
          totalItems={totalCount}
          pageSize={filters.pageSize}
          currentPage={filters.page}
        />
      </div>
    </div>
  );
}
