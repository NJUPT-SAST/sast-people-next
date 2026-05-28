"use client";

import { sendEmailBatch } from "@/action/email/send";
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
  draft: "待确认",
  queued: "队列中",
  completed: "已完成",
  failed: "有失败",
};
const hiddenScrollbar = "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden";

function formatDate(value: Date | string | null) {
  if (!value) return "-";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("zh-CN", {
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
        "flex min-w-14 flex-col items-center rounded-md border px-2.5 py-1.5",
        active ? "border-primary/30 bg-primary/10" : "bg-background/70",
      )}
    >
      <span className="text-base font-semibold tabular-nums leading-none">
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
          "max-h-[85dvh] w-[calc(100vw-2rem)] max-w-3xl overflow-y-auto",
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
              updateEmailTemplateSetting(setting.templateKey, values).then(() =>
                router.refresh(),
              ),
              {
                loading: "正在保存模板",
                success: "模板已保存",
                error: "保存失败",
              },
            );
          }}
        >
          <div className="flex flex-col gap-2">
            <Label>邮件标题</Label>
            <input
              type="hidden"
              name="subjectTemplate"
              value={setting.subjectTemplate}
            />
            <div className="flex h-9 items-center rounded-md border bg-muted/30 px-3 text-sm text-muted-foreground">
              按流程自动生成：流程名称 + 结果通知
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor={`${setting.templateKey}-contact`}>联系邮箱</Label>
            <Input
              id={`${setting.templateKey}-contact`}
              name="contactEmail"
              defaultValue={setting.contactEmail}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor={`${setting.templateKey}-form-label`}>表单按钮文案</Label>
            <Input
              id={`${setting.templateKey}-form-label`}
              name="memberFormLabel"
              defaultValue={setting.memberFormLabel}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor={`${setting.templateKey}-group-name`}>飞书群名</Label>
            <Input
              id={`${setting.templateKey}-group-name`}
              name="feishuGroupName"
              defaultValue={setting.feishuGroupName}
            />
          </div>
          <div className="flex flex-col gap-2 md:col-span-2">
            <Label htmlFor={`${setting.templateKey}-form-url`}>成员信息表链接</Label>
            <Input
              id={`${setting.templateKey}-form-url`}
              name="memberInfoFormUrl"
              defaultValue={setting.memberInfoFormUrl}
            />
          </div>
          <div className="flex flex-col gap-2 md:col-span-2">
            <Label htmlFor={`${setting.templateKey}-group-url`}>飞书群链接</Label>
            <Input
              id={`${setting.templateKey}-group-url`}
              name="feishuGroupUrl"
              defaultValue={setting.feishuGroupUrl}
            />
          </div>
          <div className="flex flex-col gap-2 md:col-span-2">
            <Label htmlFor={`${setting.templateKey}-calendar-url`}>活动日历链接</Label>
            <Input
              id={`${setting.templateKey}-calendar-url`}
              name="calendarUrl"
              defaultValue={setting.calendarUrl}
            />
          </div>
          <div className="flex flex-col gap-2 md:col-span-2">
            <Label htmlFor={`${setting.templateKey}-help-url`}>飞书注册说明</Label>
            <Input
              id={`${setting.templateKey}-help-url`}
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

function SendLane({
  flow,
  accept,
}: {
  flow: FlowTarget;
  accept: boolean;
}) {
  const router = useRouter();
  const recipients = accept ? flow.passed : flow.failed;
  const sentRecipients = accept ? flow.accepted : flow.rejected;
  const subject = accept ? flow.acceptedSubject : flow.rejectedSubject;
  const previewHtml = accept ? flow.acceptedPreviewHtml : flow.rejectedPreviewHtml;
  const tone = accept ? "border-primary/25 bg-primary/5" : "border-destructive/20 bg-destructive/5";
  const resultLabel = accept ? "通过" : "不通过";

  return (
    <div className={cn("flex flex-col gap-4 rounded-lg border p-4 lg:p-5", tone)}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-semibold">
            {resultLabel}邮件
          </p>
          <p className="mt-1 break-words text-xs text-muted-foreground">{subject}</p>
        </div>
        <div className="flex shrink-0 gap-2 sm:justify-end">
          <CountPill label="未发" value={recipients.length} active={recipients.length > 0} />
          <CountPill label="已发" value={sentRecipients.length} />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <div className="grid grid-cols-2 gap-2">
          <RecipientsDialog
            recipients={recipients}
            title={`${flow.title} ${resultLabel}邮件未发名单`}
            triggerLabel="查看名单"
          />
          <PreviewDialog
            title={`${flow.title} ${resultLabel}邮件`}
            html={previewHtml}
            triggerClassName="w-full"
          />
        </div>
        <Button
            size="sm"
            className="w-full"
            disabled={recipients.length === 0}
            onClick={() => {
              toast.promise(
                sendResultEmailFromFlow(flow.id, accept).then(() => router.refresh()),
                {
                  loading: "正在创建批次并加入发送队列",
                  success: "邮件已加入发送队列，结果已更新",
                  error: "发送失败",
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
          <DesktopTemplateActions templateSettings={templateSettings} />
        </div>

        <div className="border-b p-3 lg:hidden">
          <MobileTemplateActions templateSettings={templateSettings} />
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
          {selectedFlow && (
            <FlowSummary flow={selectedFlow} />
          )}
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

          <div className="p-3 sm:p-4">
            {selectedFlow ? (
                <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-1">
                  <div className="min-w-0">
                    <h3 className="truncate text-lg font-semibold">{selectedFlow.title}</h3>
                    <p className="text-sm text-muted-foreground">
                      发送只处理未发名单，已发人员不会重复发送。
                    </p>
                  </div>
                </div>
                <div className="grid gap-3 xl:grid-cols-2">
                  <SendLane flow={selectedFlow} accept />
                  <SendLane flow={selectedFlow} accept={false} />
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
                <TableHead>已发送</TableHead>
                <TableHead>失败</TableHead>
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
                  const canRetry = batch.status === "draft" || batch.status === "failed";
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
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={!canRetry}
                            onClick={() => {
                              toast.promise(
                                sendEmailBatch(batch.id).then(() => router.refresh()),
                                {
                                  loading: "正在重新加入队列",
                                  success: "已加入发送队列",
                                  error: "操作失败",
                                },
                              );
                            }}
                          >
                            <RotateCcw data-icon="inline-start" />
                            发送
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
              const canRetry = batch.status === "draft" || batch.status === "failed";
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
                      <p className="text-xs text-muted-foreground">已发送</p>
                      <p className="font-semibold tabular-nums">{batch.counts.sent}</p>
                    </div>
                    <div className="rounded-md bg-muted/30 p-2">
                      <p className="text-xs text-muted-foreground">失败</p>
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
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={!canRetry}
                      onClick={() => {
                        toast.promise(
                          sendEmailBatch(batch.id).then(() => router.refresh()),
                          {
                            loading: "正在重新加入队列",
                            success: "已加入发送队列",
                            error: "操作失败",
                          },
                        );
                      }}
                    >
                      <RotateCcw data-icon="inline-start" />
                      发送
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
