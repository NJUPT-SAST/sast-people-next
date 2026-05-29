"use client";

import { sendEmailBatch } from "@/action/email/send";
import { sendEmailTest } from "@/action/email/test-send";
import { updateEmailTemplateSetting } from "@/action/email/template";
import { sendResultEmailFromFlow } from "@/action/email/workspace";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { Eye, RotateCcw, Save, Search, Send, Settings2, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";

type EmailBatch = Awaited<
  ReturnType<typeof import("@/action/email/list").listEmailBatches>
>[number];
type FlowTarget = Awaited<
  ReturnType<typeof import("@/action/email/workspace").listEmailFlowTargets>
>[number];
type TemplateSetting = Awaited<
  ReturnType<typeof import("@/action/email/template").listEmailTemplateSettings>
>[number];

const batchStatusText: Record<string, string> = {
  draft: "待发送",
  queued: "发送中",
  completed: "已完成",
  failed: "有失败",
};
const deliveryStatusText: Record<string, string> = {
  pending: "待发送",
  sending: "发送中",
  sent: "已发送",
  failed: "失败",
};
const hiddenScrollbar = "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden";

function formatDate(value: Date | string | null) {
  if (!value) return "-";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function getSettingLabel(templateKey: string) {
  return templateKey.endsWith("accepted") ? "通过模板" : "不通过模板";
}

function CountPill({
  label,
  value,
  active,
}: {
  label: string;
  value: number;
  active?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex min-w-14 flex-col items-center rounded-md border px-2.5 py-1.5 lg:min-w-16 lg:px-3 lg:py-2",
        active ? "border-primary/30 bg-primary/10" : "bg-background/70",
      )}
    >
      <span className="text-base font-semibold tabular-nums leading-none lg:text-lg">
        {value}
      </span>
      <span className="mt-1 text-[11px] text-muted-foreground">{label}</span>
    </div>
  );
}

function FlowSummary({ flow }: { flow: FlowTarget }) {
  const unsent = flow.passed.length + flow.failed.length;

  return (
    <div className="mt-2 text-xs text-muted-foreground">
      <span className={cn(unsent > 0 && "text-primary")}>
        {unsent > 0 ? `${unsent} 封待发` : "无待发邮件"}
      </span>
    </div>
  );
}

function MobileTemplateActions({
  templateSettings,
}: {
  templateSettings: TemplateSetting[];
}) {
  return (
    <div className="grid grid-cols-2 gap-2 lg:hidden">
      {templateSettings.map((setting) => (
        <TemplateDialog key={setting.templateKey} setting={setting} />
      ))}
    </div>
  );
}

function DesktopTemplateActions({
  templateSettings,
}: {
  templateSettings: TemplateSetting[];
}) {
  return (
    <div className="hidden gap-2 lg:flex lg:flex-wrap">
      {templateSettings.map((setting) => (
        <TemplateDialog key={setting.templateKey} setting={setting} />
      ))}
    </div>
  );
}

function createValuesFromForm(form: HTMLFormElement) {
  const data = new FormData(form);
  return {
    subjectTemplate: String(data.get("subjectTemplate") ?? ""),
    memberInfoFormUrl: String(data.get("memberInfoFormUrl") ?? ""),
    feishuGroupUrl: String(data.get("feishuGroupUrl") ?? ""),
    calendarUrl: String(data.get("calendarUrl") ?? ""),
    feishuRegisterHelpUrl: String(data.get("feishuRegisterHelpUrl") ?? ""),
    contactEmail: String(data.get("contactEmail") ?? ""),
    memberFormLabel: String(data.get("memberFormLabel") ?? ""),
    feishuGroupName: String(data.get("feishuGroupName") ?? ""),
  };
}

function TemplateField({
  id,
  name,
  label,
  defaultValue,
  className,
}: {
  id: string;
  name: string;
  label: string;
  defaultValue: string;
  className?: string;
}) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <Label htmlFor={id} className="text-xs text-muted-foreground">
        {label}
      </Label>
      <Input
        id={id}
        name={name}
        defaultValue={defaultValue}
        className="min-w-0"
      />
    </div>
  );
}

function TemplateDialog({ setting }: { setting: TemplateSetting }) {
  const router = useRouter();

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="w-full sm:w-auto">
          <Settings2 data-icon="inline-start" />
          {getSettingLabel(setting.templateKey)}
        </Button>
      </DialogTrigger>
      <DialogContent
        className={cn(
          "max-h-[85dvh] w-[calc(100vw-2rem)] max-w-2xl overflow-y-auto",
          hiddenScrollbar,
        )}
      >
        <DialogHeader>
          <DialogTitle>{getSettingLabel(setting.templateKey)}</DialogTitle>
          <DialogDescription>
            邮件版式固定；这里只调整标题、链接、群名和联系邮箱。
          </DialogDescription>
        </DialogHeader>
        <form
          className="grid min-w-0 gap-4 md:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault();
            const values = createValuesFromForm(event.currentTarget);
            toast.promise(
              updateEmailTemplateSetting(setting.templateKey, values).then((result) => {
                if (!result.ok) throw new Error(result.message);
                router.refresh();
              }),
              {
                loading: "正在保存模板",
                success: "模板已保存",
                error: (error) =>
                  error instanceof Error ? error.message : "保存失败",
              },
            );
          }}
        >
          <div className="rounded-lg border bg-muted/10 p-3 md:col-span-2">
            <p className="text-xs font-medium text-muted-foreground">邮件标题</p>
            <input
              type="hidden"
              name="subjectTemplate"
              value={setting.subjectTemplate}
            />
            <div className="mt-2 flex flex-col gap-1 rounded-md bg-background/70 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
              <span className="text-sm">流程名称 + 结果通知</span>
              <span className="text-xs text-muted-foreground">自动生成</span>
            </div>
          </div>

          <div className="grid gap-3 rounded-lg border bg-muted/10 p-3 md:col-span-2 md:grid-cols-2">
            <TemplateField
              id={`${setting.templateKey}-contact`}
              label="联系邮箱"
              name="contactEmail"
              defaultValue={setting.contactEmail}
            />
            <TemplateField
              id={`${setting.templateKey}-form-label`}
              label="表单按钮文案"
              name="memberFormLabel"
              defaultValue={setting.memberFormLabel}
            />
            <TemplateField
              id={`${setting.templateKey}-group-name`}
              label="飞书群名"
              name="feishuGroupName"
              defaultValue={setting.feishuGroupName}
              className="md:col-span-2"
            />
          </div>

          <div className="grid gap-3 rounded-lg border bg-muted/10 p-3 md:col-span-2">
            <TemplateField
              id={`${setting.templateKey}-form-url`}
              label="成员信息表链接"
              name="memberInfoFormUrl"
              defaultValue={setting.memberInfoFormUrl}
            />
            <TemplateField
              id={`${setting.templateKey}-group-url`}
              label="飞书群链接"
              name="feishuGroupUrl"
              defaultValue={setting.feishuGroupUrl}
            />
            <TemplateField
              id={`${setting.templateKey}-calendar-url`}
              label="活动日历链接"
              name="calendarUrl"
              defaultValue={setting.calendarUrl}
            />
            <TemplateField
              id={`${setting.templateKey}-help-url`}
              label="飞书注册说明"
              name="feishuRegisterHelpUrl"
              defaultValue={setting.feishuRegisterHelpUrl}
            />
          </div>
          <div className="flex justify-end md:col-span-2">
            <Button type="submit" className="w-full sm:w-auto">
              <Save data-icon="inline-start" />
              保存模板
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function PreviewDialog({
  title,
  html,
  triggerLabel = "模板样张",
  description = "样张使用占位称呼；真实发送时会替换为收件人姓名。",
  triggerClassName,
}: {
  title: string;
  html: string | null;
  triggerLabel?: string;
  description?: string;
  triggerClassName?: string;
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" disabled={!html} className={triggerClassName}>
          <Eye data-icon="inline-start" />
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent
        className={cn(
          "max-h-[85dvh] w-[calc(100vw-2rem)] max-w-5xl overflow-y-auto",
          hiddenScrollbar,
        )}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {html && (
          <iframe
            title={title}
            srcDoc={html}
            className="h-[70vh] w-full rounded-md border bg-background"
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function RecipientsDialog({
  recipients,
  title,
  triggerLabel = "查看名单",
}: {
  recipients: FlowTarget["passed"];
  title: string;
  triggerLabel?: string;
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          disabled={recipients.length === 0}
          className="w-full sm:w-auto"
        >
          <Users data-icon="inline-start" />
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent
        className={cn(
          "max-h-[85dvh] w-[calc(100vw-2rem)] max-w-3xl overflow-y-auto",
          hiddenScrollbar,
        )}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            收件地址固定按学号生成，不使用个人资料中的邮箱字段。
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[60vh] overflow-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>姓名</TableHead>
                <TableHead>学号</TableHead>
                <TableHead>教育邮箱</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recipients.map((item) => (
                <TableRow key={item.userId}>
                  <TableCell>{item.name}</TableCell>
                  <TableCell>{item.studentId}</TableCell>
                  <TableCell className="font-mono text-xs">
                    {item.studentId}@njupt.edu.cn
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function StatusDialog({ batch }: { batch: EmailBatch }) {
  const renderDeliveryStatus = (status: string) => (
    <Badge
      variant={
        status === "failed"
          ? "destructive"
          : status === "sent"
            ? "default"
            : "outline"
      }
    >
      {deliveryStatusText[status] ?? status}
    </Badge>
  );

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          明细
        </Button>
      </DialogTrigger>
      <DialogContent
        className={cn(
          "max-h-[85dvh] w-[calc(100vw-2rem)] max-w-4xl overflow-y-auto",
          hiddenScrollbar,
        )}
      >
        <DialogHeader>
          <DialogTitle>{batch.flowTitle} 发送明细</DialogTitle>
          <DialogDescription>
            每位收件人的发送状态和失败原因会保留在这里。
          </DialogDescription>
        </DialogHeader>

        <div className="flex max-h-[62vh] flex-col gap-3 overflow-y-auto pr-1 md:hidden">
          {batch.deliveries.map((delivery) => (
            <div key={delivery.id} className="rounded-md border bg-card p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {delivery.userName}
                  </p>
                  <p className="mt-1 break-all font-mono text-xs text-muted-foreground">
                    {delivery.toAddress}
                  </p>
                </div>
                <div className="shrink-0">
                  {renderDeliveryStatus(delivery.status)}
                </div>
              </div>
              <div className="mt-3 grid gap-1.5 text-xs">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">发送时间</span>
                  <span className="tabular-nums">{formatDate(delivery.sentAt)}</span>
                </div>
                <div className="rounded-md bg-muted/30 p-2">
                  <p className="text-muted-foreground">失败原因</p>
                  <p className="mt-1 break-words">
                    {delivery.errorMessage ?? "-"}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="hidden max-h-[62vh] overflow-y-auto rounded-md border md:block">
          <Table containerClassName="overflow-visible">
            <TableHeader>
              <TableRow>
                <TableHead className="w-[96px]">姓名</TableHead>
                <TableHead className="w-[190px]">收件地址</TableHead>
                <TableHead className="w-[88px]">状态</TableHead>
                <TableHead className="w-[116px]">发送时间</TableHead>
                <TableHead>失败原因</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {batch.deliveries.map((delivery) => (
                <TableRow key={delivery.id}>
                  <TableCell className="max-w-[96px] truncate">
                    {delivery.userName}
                  </TableCell>
                  <TableCell className="break-all font-mono text-xs whitespace-normal">
                    {delivery.toAddress}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {renderDeliveryStatus(delivery.status)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                    {formatDate(delivery.sentAt)}
                  </TableCell>
                  <TableCell className="break-words text-xs text-muted-foreground whitespace-normal">
                    {delivery.errorMessage ?? "-"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function TestEmailButton() {
  const [address, setAddress] = useState("");

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="w-full sm:w-auto">
          <Send data-icon="inline-start" />
          测试发送
        </Button>
      </DialogTrigger>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-md">
        <DialogHeader>
          <DialogTitle>测试发送</DialogTitle>
          <DialogDescription>
            仅支持南邮教育邮箱；也可以直接输入学号。
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="test-email-address">收件地址</Label>
          <Input
            id="test-email-address"
            value={address}
            onChange={(event) => setAddress(event.target.value)}
            placeholder="学号或 njupt.edu.cn 邮箱"
            inputMode="email"
          />
        </div>
        <Button
          onClick={() => {
            toast.promise(
              sendEmailTest(address).then((result) => {
                if (!result.ok) throw new Error("测试邮件发送失败");
                return result;
              }),
              {
                loading: "正在发送测试邮件",
                success: (result) => `测试邮件已发送到 ${result.to}`,
                error: (error) =>
                  error instanceof Error ? error.message : "测试邮件发送失败",
              },
            );
          }}
        >
          <Send data-icon="inline-start" />
          发送测试邮件
        </Button>
      </DialogContent>
    </Dialog>
  );
}

function SendLane({
  flow,
  accept,
  batches,
}: {
  flow: FlowTarget;
  accept: boolean;
  batches: EmailBatch[];
}) {
  const router = useRouter();
  const recipients = accept ? flow.passed : flow.failed;
  const subject = accept ? flow.acceptedSubject : flow.rejectedSubject;
  const previewHtml = accept ? flow.acceptedPreviewHtml : flow.rejectedPreviewHtml;
  const tone = accept ? "border-primary/25 bg-primary/5" : "border-destructive/20 bg-destructive/5";
  const resultLabel = accept ? "通过" : "不通过";
  const laneDeliveries = batches
    .filter((batch) => batch.flowId === flow.id && batch.accept === accept)
    .flatMap((batch) => batch.deliveries);
  const deliveryUserFlowIds = new Set(
    laneDeliveries.map((delivery) => delivery.userFlowId),
  );
  const newRecipientCount = recipients.filter(
    (recipient) => !deliveryUserFlowIds.has(recipient.userFlowId),
  ).length;
  const sentCount = laneDeliveries.filter((delivery) => delivery.status === "sent").length;
  const actionableCount = newRecipientCount;

  return (
    <div className={cn("flex flex-col gap-4 rounded-lg border p-4 lg:min-h-[148px] lg:p-5", tone)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold">
            {resultLabel}邮件
          </p>
          <p className="mt-1 break-words text-xs text-muted-foreground">{subject}</p>
        </div>
        <div className="flex shrink-0 flex-wrap justify-end gap-2">
          <CountPill label="待发送" value={newRecipientCount} active={newRecipientCount > 0} />
          <CountPill label="已发送" value={sentCount} />
        </div>
      </div>

      <div className="mt-auto flex flex-col gap-2">
        <div className="grid grid-cols-2 gap-2">
          <RecipientsDialog
            recipients={recipients}
            title={`${flow.title} ${resultLabel}邮件未发名单`}
            triggerLabel="名单"
          />
          <PreviewDialog
            title={`${flow.title} ${resultLabel}邮件`}
            html={previewHtml}
            triggerLabel="样张"
            triggerClassName="w-full"
          />
        </div>
        <Button
            size="sm"
            className="w-full"
            disabled={actionableCount === 0}
            onClick={() => {
              toast.promise(
                sendResultEmailFromFlow(flow.id, accept).then(() => router.refresh()),
                {
                  loading: "正在处理邮件发送",
                  success: "邮件发送任务已处理，结果已更新",
                  error: (error) =>
                    error instanceof Error ? error.message : "发送失败",
                },
              );
            }}
          >
            <Send data-icon="inline-start" />
            发送
          </Button>
      </div>
    </div>
  );
}

export function EmailDashboardClient({
  batches,
  flowTargets,
  templateSettings,
}: {
  batches: EmailBatch[];
  flowTargets: FlowTarget[];
  templateSettings: TemplateSetting[];
}) {
  const router = useRouter();
  const [selectedFlowId, setSelectedFlowId] = useState(flowTargets[0]?.id);
  const [flowQuery, setFlowQuery] = useState("");
  const filteredFlows = useMemo(() => {
    const query = flowQuery.trim().toLowerCase();
    if (!query) return flowTargets;
    return flowTargets.filter((flow) =>
      flow.title.toLowerCase().includes(query),
    );
  }, [flowQuery, flowTargets]);
  const selectedFlow = useMemo(() => {
    const selected = flowTargets.find((flow) => flow.id === selectedFlowId);
    if (!flowQuery.trim()) return selected ?? flowTargets[0];
    if (selected && filteredFlows.some((flow) => flow.id === selected.id)) {
      return selected;
    }
    return filteredFlows[0] ?? selected ?? flowTargets[0];
  }, [filteredFlows, flowQuery, flowTargets, selectedFlowId]);

  return (
    <div className="flex flex-col gap-5">
      <section className="rounded-lg border bg-card">
        <div className="flex flex-col gap-4 border-b p-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-base font-semibold">发送控制</h2>
            <p className="text-sm text-muted-foreground">
              选择一个招新流程，系统自动匹配当前通过/不通过名单。
            </p>
          </div>
          <div className="hidden gap-2 lg:flex lg:flex-wrap">
            <TestEmailButton />
            <DesktopTemplateActions templateSettings={templateSettings} />
          </div>
        </div>

        <div className="border-b p-3 lg:hidden">
          <div className="rounded-lg border bg-background/35 p-3">
            <div className="mb-2">
              <TestEmailButton />
            </div>
            <MobileTemplateActions templateSettings={templateSettings} />
            <div className="mt-3">
              <Label htmlFor="email-flow-picker" className="mb-2 block text-xs text-muted-foreground">
                当前流程
              </Label>
              <select
                id="email-flow-picker"
                value={selectedFlow?.id ?? ""}
                onChange={(event) => setSelectedFlowId(Number(event.target.value))}
                className="h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                disabled={filteredFlows.length === 0}
              >
                {filteredFlows.map((flow) => (
                  <option key={flow.id} value={flow.id}>
                    {flow.title}
                  </option>
                ))}
              </select>
            </div>
            {selectedFlow && (
              <FlowSummary flow={selectedFlow} />
            )}
          </div>
          <div className="mt-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={flowQuery}
                onChange={(event) => setFlowQuery(event.target.value)}
                placeholder="搜索流程"
                className="pl-9"
              />
            </div>
          </div>
        </div>

        <div className="grid lg:grid-cols-[260px_minmax(0,1fr)]">
          <div className="hidden p-3 lg:block lg:border-r">
            <div className="mb-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={flowQuery}
                  onChange={(event) => setFlowQuery(event.target.value)}
                  placeholder="搜索流程"
                  className="pl-9"
                />
              </div>
            </div>
            <div
              className={cn(
                "flex h-[220px] flex-col gap-2 overflow-y-auto pr-1",
                hiddenScrollbar,
              )}
            >
              {filteredFlows.map((flow) => {
                const active = selectedFlow?.id === flow.id;
                return (
                  <button
                    key={flow.id}
                    type="button"
                    onClick={() => setSelectedFlowId(flow.id)}
                    className={cn(
                      "rounded-md border p-3 text-left transition-colors hover:bg-accent",
                      active && "border-primary bg-primary/5",
                    )}
                  >
                    <p className="truncate text-sm font-medium">{flow.title}</p>
                    <FlowSummary flow={flow} />
                  </button>
                );
              })}
              {filteredFlows.length === 0 && (
                <div className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
                  没有匹配的流程。
                </div>
              )}
            </div>
          </div>

          <div className="p-3 sm:p-4 lg:p-5">
            {selectedFlow ? (
              <div className="flex flex-col gap-4 lg:gap-5">
                <div className="flex flex-col gap-1">
                  <div className="min-w-0">
                    <h3 className="truncate text-lg font-semibold">{selectedFlow.title}</h3>
                    <p className="text-sm text-muted-foreground">
                      发送会为待发送名单创建发送记录，已有记录不会重复创建。
                    </p>
                  </div>
                </div>
                <div className="grid gap-3 xl:grid-cols-2">
                  <SendLane flow={selectedFlow} accept batches={batches} />
                  <SendLane flow={selectedFlow} accept={false} batches={batches} />
                </div>
              </div>
            ) : (
              <div className="flex h-full items-center justify-center rounded-md border border-dashed p-8 text-sm text-muted-foreground">
                暂无可发送的招新流程。
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="rounded-lg border bg-card">
        <div className="flex items-center justify-between gap-3 border-b p-4">
          <div>
            <h2 className="text-base font-semibold">发送记录</h2>
            <p className="text-sm text-muted-foreground">
              最近 20 个批次；从这里发出的邮件会保存每位同学收到的正文。
            </p>
          </div>
        </div>
        <div className={cn("hidden overflow-x-auto p-4 md:block", hiddenScrollbar)}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>批次</TableHead>
                <TableHead>类型</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>人数</TableHead>
                <TableHead>发送成功</TableHead>
                <TableHead>发送失败</TableHead>
                <TableHead>创建时间</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {batches.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="h-20 text-center text-muted-foreground">
                    暂无发送记录。已有“邮件已发”状态的人员会计入上方已发人数。
                  </TableCell>
                </TableRow>
              ) : (
                batches.map((batch) => {
                  const preview = batch.deliveries[0]?.htmlSnapshot ?? null;
                  const canRetry = batch.counts.pending > 0 || batch.counts.failed > 0;
                  return (
                    <TableRow key={batch.id}>
                      <TableCell>
                        <div className="font-medium">{batch.flowTitle}</div>
                        <div className="text-xs text-muted-foreground">{batch.subject}</div>
                      </TableCell>
                      <TableCell>{batch.accept ? "通过" : "不通过"}</TableCell>
                      <TableCell>
                        <Badge variant={batch.status === "failed" ? "destructive" : "outline"}>
                          {batchStatusText[batch.status]}
                        </Badge>
                      </TableCell>
                      <TableCell>{batch.totalCount}</TableCell>
                      <TableCell>{batch.counts.sent}</TableCell>
                      <TableCell>{batch.counts.failed}</TableCell>
                      <TableCell>{formatDate(batch.createdAt)}</TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-2">
                          <PreviewDialog
                            title={`${batch.flowTitle} 查看邮件`}
                            html={preview}
                            triggerLabel="查看邮件"
                            description="每位收件人的邮件正文都会保存；这里展示该批次第一封。"
                          />
                          <StatusDialog batch={batch} />
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={!canRetry}
                            onClick={() => {
                              toast.promise(
                                sendEmailBatch(batch.id).then(() => router.refresh()),
                                {
                                  loading: "正在处理邮件发送",
                                  success: "邮件发送任务已处理",
                                  error: (error) =>
                                    error instanceof Error ? error.message : "操作失败",
                                },
                              );
                            }}
                          >
                            <RotateCcw data-icon="inline-start" />
                            重试
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
        <div className="flex flex-col gap-3 p-4 md:hidden">
          {batches.length === 0 ? (
            <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
              暂无发送记录。已有“邮件已发”状态的人员会计入上方已发人数。
            </div>
          ) : (
            batches.map((batch) => {
              const preview = batch.deliveries[0]?.htmlSnapshot ?? null;
              const canRetry = batch.counts.pending > 0 || batch.counts.failed > 0;
              return (
                <div key={batch.id} className="rounded-md border p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{batch.flowTitle}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {batch.accept ? "通过" : "不通过"} · {formatDate(batch.createdAt)}
                      </p>
                    </div>
                    <Badge
                      variant={batch.status === "failed" ? "destructive" : "outline"}
                    >
                      {batchStatusText[batch.status]}
                    </Badge>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
                    <div className="rounded-md bg-muted/30 p-2">
                      <p className="text-xs text-muted-foreground">人数</p>
                      <p className="font-semibold tabular-nums">{batch.totalCount}</p>
                    </div>
                    <div className="rounded-md bg-muted/30 p-2">
                      <p className="text-xs text-muted-foreground">发送成功</p>
                      <p className="font-semibold tabular-nums">{batch.counts.sent}</p>
                    </div>
                    <div className="rounded-md bg-muted/30 p-2">
                      <p className="text-xs text-muted-foreground">发送失败</p>
                      <p className="font-semibold tabular-nums">{batch.counts.failed}</p>
                    </div>
                  </div>
                  <p className="mt-3 break-words text-xs text-muted-foreground">
                    {batch.subject}
                  </p>
                  <div className="mt-3 flex flex-col gap-2">
                    <PreviewDialog
                      title={`${batch.flowTitle} 查看邮件`}
                      html={preview}
                      triggerLabel="查看邮件"
                      description="每位收件人的邮件正文都会保存；这里展示该批次第一封。"
                    />
                    <StatusDialog batch={batch} />
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={!canRetry}
                      onClick={() => {
                        toast.promise(
                          sendEmailBatch(batch.id).then(() => router.refresh()),
                          {
                            loading: "正在处理邮件发送",
                            success: "邮件发送任务已处理",
                            error: (error) =>
                              error instanceof Error ? error.message : "操作失败",
                          },
                        );
                      }}
                    >
                      <RotateCcw data-icon="inline-start" />
                      重试
                    </Button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>
    </div>
  );
}
