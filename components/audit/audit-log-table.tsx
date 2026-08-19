import Link from "next/link";
import { Fragment } from "react";
import { RotateCcw, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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

const actionGroups = [
  { value: "review", label: "批卷" },
  { value: "email", label: "邮件" },
  { value: "evaluation", label: "面评" },
  { value: "flow", label: "流程" },
  { value: "user", label: "用户" },
];

const actionLabels: Record<string, string> = {
  "review.score.upsert": "保存评分",
  "review.score.batch_upsert": "确认评分并返回",
  "email.batch.create": "创建邮件批次",
  "email.batch_send": "发送邮件批次",
  "email.recover_stale": "恢复中断邮件",
  "email.delivery_retry": "重试单封邮件",
  "email.test_send": "测试发送邮件",
  "email.template.update": "更新邮件模板",
  "email.template.reset": "重置邮件模板",
  "flow.create": "创建流程",
  "flow.update": "更新流程",
  "flow.delete": "删除流程",
  "flow.duplicate": "复制流程",
  "flow.update_problems": "更新题目",
  "flow.update_steps": "更新流程步骤",
  "user.update_role": "修改用户角色",
  "user.ban": "禁用用户",
  "user_flow.forward": "推进考生流程",
  "user_flow.finish": "设置考生通过",
  "user_flow.reject": "设置考生不通过",
  "user_flow.reopen": "重开考生流程",
  "user_flow.backward": "回退考生流程",
  "user_flow.batch_update_step": "批量更新考生步骤",
  "user_flow.batch_end": "批量设置考生结果",
  "user_flow.batch_set_outcome": "批量设置考生结果",
  "evaluation.create": "提交面评",
  "evaluation.update_pending": "更新待审面评",
  "evaluation.reject_candidate": "拒绝候选人",
  "evaluation.reopen_and_create": "重开并创建面评",
  "evaluation.approve": "通过面评",
  "evaluation.reject": "驳回面评",
  "evaluation.unapprove": "撤销通过",
  "evaluation.reopen": "重开面评",
  "interview_schedule.create": "创建面试日程",
  "interview_schedule.update": "更新面试日程",
  "interview_schedule.cancel": "取消面试日程",
  "interview_schedule.meeting.ended": "记录面试结束",
  "interview_schedule.meeting.ended_manual": "手动确认面试结束",
  "interview_schedule.meeting_minute.generated": "生成会议妙记",
};

const metadataLabels: Record<string, string> = {
  accept: "是否录取",
  changedFields: "变更字段",
  flowId: "流程 ID",
  flowName: "流程名称",
  flowType: "流程类型",
  hasCustomAddress: "使用自定义收件地址",
  hasMeetingLink: "包含会议链接",
  itemCount: "项目数量",
  mode: "操作模式",
  previousStatus: "原状态",
  problemCount: "题目数量",
  problemGroups: "题目分类",
  provider: "服务提供方",
  queuedCount: "入队数量",
  recoveredCount: "恢复数量",
  recommendation: "面评建议",
  sourceFlowId: "来源流程 ID",
  status: "结果",
  stepCount: "步骤数量",
  stepId: "步骤 ID",
  stepOrder: "步骤序号",
  stepOrders: "步骤序号",
  targetRole: "目标角色",
  targetUserCount: "目标人数",
  templateKey: "模板标识",
  templateName: "模板名称",
  title: "流程名称",
};

const metadataValueLabels: Record<string, string> = {
  accepted: "通过",
  create: "创建",
  failed: "不通过",
  feishu: "飞书",
  passed: "通过",
  recruitment: "笔试招新",
  rejected: "不通过",
  update: "更新",
};

function getActionLabel(action: string) {
  return actionLabels[action] ?? `未命名操作（${action}）`;
}

function getMetadata(value: AuditLogItem["metadata"]) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function getTargetUserLabel(item: AuditLogItem) {
  if (item.targetUser) {
    return item.targetUser.studentId
      ? `${item.targetUser.name ?? "未知用户"}（${item.targetUser.studentId}）`
      : item.targetUser.name ?? `用户 #${item.targetUser.id}`;
  }

  if (item.targetUsers.length > 0) {
    return item.targetUsers
      .map((user) =>
        user.studentId
          ? `${user.name ?? "未知用户"}（${user.studentId}）`
          : user.name ?? `用户 #${user.id}`,
      )
      .join("、");
  }

  return null;
}

function formatMetadataValue(value: unknown): string {
  if (Array.isArray(value)) {
    return value.map((item) => formatMetadataValue(item)).join("、");
  }

  if (value === true) return "是";
  if (value === false) return "否";
  if (value === null || value === undefined || value === "") return "无";
  return typeof value === "string"
    ? metadataValueLabels[value] ?? value
    : String(value);
}

function getMetadataEntries(metadata: Record<string, unknown>) {
  return Object.entries(metadata).filter(([key]) =>
    !["scoreChanges", "targetUserId", "targetUserIds", "userId"].includes(key),
  );
}

function getScoreChanges(metadata: Record<string, unknown>) {
  return Array.isArray(metadata.scoreChanges)
    ? metadata.scoreChanges.filter(
        (value): value is Record<string, unknown> =>
          typeof value === "object" && value !== null && !Array.isArray(value),
      )
    : [];
}

function getAuditSummary(item: AuditLogItem) {
  const metadata = getMetadata(item.metadata);
  const targetUserLabel = getTargetUserLabel(item);
  const scoreChanges = getScoreChanges(metadata);

  if (scoreChanges.length > 0) {
    const change = scoreChanges[0];
    const title = String(change.problemTitle ?? `题目 #${String(change.problemId)}`);
    const previous =
      change.previousScore === null || change.previousScore === undefined
        ? "未评分"
        : String(change.previousScore);
    const suffix = scoreChanges.length > 1 ? ` 等 ${scoreChanges.length} 题` : "";
    return `${targetUserLabel ?? "考生"} · ${title} ${previous} → ${String(change.nextScore)} 分${suffix}`;
  }

  if (targetUserLabel) {
    const outcome = metadata.status ? ` · ${formatMetadataValue(metadata.status)}` : "";
    return `${targetUserLabel}${outcome}`;
  }

  const entries = getMetadataEntries(metadata);
  if (entries.length > 0) {
    const [key, value] = entries[0];
    return `${metadataLabels[key] ?? key}：${formatMetadataValue(value)}`;
  }

  return "无附加说明";
}

function MetadataDetails({ item }: { item: AuditLogItem }) {
  const metadata = getMetadata(item.metadata);
  const targetUserLabel = getTargetUserLabel(item);
  const scoreChanges = getScoreChanges(metadata);
  const metadataEntries = getMetadataEntries(metadata);

  return (
    <div className="flex flex-col gap-5">
      <dl className="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-[max-content_minmax(0,1fr)]">
        <dt className="text-muted-foreground">操作者</dt>
        <dd>{item.actorName ?? "未知用户"}{item.actorStudentId ? `（${item.actorStudentId}）` : ""}</dd>
        <dt className="text-muted-foreground">操作</dt>
        <dd>{getActionLabel(item.action)}</dd>
        <dt className="text-muted-foreground">资源</dt>
        <dd>{item.resourceLabel ?? item.resourceType}{item.resourceId ? ` #${item.resourceId}` : ""}</dd>
        {targetUserLabel && (
          <>
            <dt className="text-muted-foreground">对象</dt>
            <dd className="break-words">{targetUserLabel}</dd>
          </>
        )}
        {metadataEntries.map(([key, value]) => (
          <Fragment key={key}>
            <dt className="text-muted-foreground">{metadataLabels[key] ?? key}</dt>
            <dd className="break-words">{formatMetadataValue(value)}</dd>
          </Fragment>
        ))}
      </dl>

      {scoreChanges.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium">评分变更</p>
          <div className="overflow-hidden rounded-md border">
            {scoreChanges.map((change, index) => (
              <div
                key={`${String(change.problemId)}-${index}`}
                className="flex items-center justify-between gap-4 border-b px-3 py-2 text-sm last:border-b-0"
              >
                <span className="font-medium">
                  {String(change.problemTitle ?? `题目 #${String(change.problemId)}`)}
                </span>
                <span className="shrink-0 text-muted-foreground">
                  {change.previousScore === null || change.previousScore === undefined
                    ? "未评分"
                    : String(change.previousScore)}
                  {" → "}
                  {String(change.nextScore)} 分
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <details className="rounded-md border px-3 py-2">
        <summary className="cursor-pointer text-sm text-muted-foreground">原始审计记录</summary>
        <pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap break-words font-mono text-xs leading-5 text-muted-foreground">
          {JSON.stringify(item, null, 2)}
        </pre>
      </details>
    </div>
  );
}

function AuditDetailDialog({ item }: { item: AuditLogItem }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 px-3 text-xs">
          查看详情
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{getActionLabel(item.action)}</DialogTitle>
          <DialogDescription>
            {originalDayjs(item.createdAt).format("YYYY-MM-DD HH:mm:ss")}
          </DialogDescription>
        </DialogHeader>
        <MetadataDetails item={item} />
      </DialogContent>
    </Dialog>
  );
}

function AuditLogMobileItem({ item }: { item: AuditLogItem }) {
  return (
    <div className="flex flex-col gap-3 border-b p-4 last:border-b-0">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-medium">{getActionLabel(item.action)}</p>
          <p className="mt-1 truncate text-sm text-muted-foreground">{getAuditSummary(item)}</p>
        </div>
        <div className="shrink-0 text-right font-mono text-xs text-muted-foreground">
          <p>{originalDayjs(item.createdAt).format("MM-DD")}</p>
          <p>{originalDayjs(item.createdAt).format("HH:mm:ss")}</p>
        </div>
      </div>
      <div className="flex items-center justify-between gap-3">
        <span className="truncate text-xs text-muted-foreground">
          {item.actorName ?? "未知用户"} · {item.resourceLabel ?? item.resourceType}
        </span>
        <AuditDetailDialog item={item} />
      </div>
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
  const hasFilters = Boolean(
    filters.actor ||
      filters.action ||
      filters.actionGroup ||
      filters.resourceType ||
      filters.from ||
      filters.to,
  );
  const groupHref = (value: string) => `/dashboard/audit?actionGroup=${value}`;

  return (
    <div className="space-y-4">
      <form action="/dashboard/audit" className="rounded-md border bg-card p-4">
        <div className="flex flex-col gap-2 pb-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm font-medium">审计记录</p>
            <p className="text-sm text-muted-foreground">
              当前显示 {start} - {end}，共 {totalCount} 条
            </p>
          </div>
          <p className="text-sm text-muted-foreground">
            {hasFilters ? "已应用筛选" : "全部记录"}
          </p>
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(170px,1fr)_minmax(220px,1.1fr)_minmax(170px,1fr)_150px_150px_auto]">
          <input type="hidden" name="actionGroup" value={filters.actionGroup} />
          <Input name="actor" defaultValue={filters.actor} placeholder="操作者姓名 / 学号 / ID" />
          <Input name="action" defaultValue={filters.action} placeholder="操作类型，例如 review.score" />
          <Input name="resourceType" defaultValue={filters.resourceType} placeholder="资源类型，例如 user_flow" />
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
        </div>

        <div className="mt-4 flex flex-col gap-2 border-t pt-4 sm:flex-row sm:items-center">
          <p className="shrink-0 text-sm text-muted-foreground">快捷筛选</p>
          <div className="flex flex-wrap gap-2">
            {actionGroups.map((group) => (
              <Button
                key={group.value}
                asChild
                variant={filters.actionGroup === group.value ? "default" : "outline"}
                size="sm"
              >
                <Link href={groupHref(group.value)}>{group.label}</Link>
              </Button>
            ))}
          </div>
        </div>
      </form>

      <div className="overflow-hidden rounded-md border bg-card">
        <div className="hidden md:block">
          <Table className="w-full table-fixed">
            <TableHeader>
              <TableRow className="bg-muted/30">
                <TableHead className="w-[12%] px-4">时间</TableHead>
                <TableHead className="w-[14%] px-4">操作者</TableHead>
                <TableHead className="w-[15%] px-4">操作</TableHead>
                <TableHead className="w-[20%] px-4">资源</TableHead>
                <TableHead className="px-4">摘要</TableHead>
                <TableHead className="w-[104px] px-2 text-right">详情</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {safeLogs.length > 0 ? (
                safeLogs.map((item) => (
                  <TableRow key={item.id} className="h-14 hover:bg-muted/25">
                    <TableCell className="px-4 py-2 align-middle">
                      <div className="font-mono text-xs leading-4 text-muted-foreground">
                        <p>{originalDayjs(item.createdAt).format("YYYY-MM-DD")}</p>
                        <p>{originalDayjs(item.createdAt).format("HH:mm:ss")}</p>
                      </div>
                    </TableCell>
                    <TableCell className="px-4 py-2 align-middle">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{item.actorName ?? "未知用户"}</p>
                        <p className="truncate font-mono text-xs text-muted-foreground">
                          {item.actorStudentId ?? `#${item.actorId}`}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell className="px-4 py-2 align-middle">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{getActionLabel(item.action)}</p>
                        <p className="truncate font-mono text-xs text-muted-foreground">{item.action}</p>
                      </div>
                    </TableCell>
                    <TableCell className="px-4 py-2 align-middle">
                      <div className="min-w-0">
                        <p className="truncate text-sm">{item.resourceLabel ?? item.resourceType}</p>
                        {item.resourceId ? (
                          <p className="font-mono text-xs text-muted-foreground">#{item.resourceId}</p>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className="px-4 py-2 align-middle">
                      <p className="truncate text-sm text-muted-foreground" title={getAuditSummary(item)}>
                        {getAuditSummary(item)}
                      </p>
                    </TableCell>
                    <TableCell className="px-2 py-2 text-right align-middle">
                      <AuditDetailDialog item={item} />
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={6} className="h-28 text-center">
                    <p className="text-sm font-medium">暂无审计记录</p>
                    <p className="mt-1 text-sm text-muted-foreground">当前筛选条件下没有可显示的数据</p>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        <div className="md:hidden">
          {safeLogs.length > 0 ? (
            safeLogs.map((item) => <AuditLogMobileItem key={item.id} item={item} />)
          ) : (
            <div className="p-8 text-center text-sm text-muted-foreground">暂无审计记录</div>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="whitespace-nowrap text-sm text-muted-foreground">显示 {start} - {end}，共 {totalCount} 条记录</p>
        <PaginationComponent totalItems={totalCount} pageSize={filters.pageSize} currentPage={filters.page} />
      </div>
    </div>
  );
}
