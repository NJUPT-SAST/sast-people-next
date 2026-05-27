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

function formatDate(value: Date | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(value);
}

function getSettingLabel(templateKey: string) {
  return templateKey.endsWith("accepted") ? "通过模板" : "不通过模板";
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
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{getSettingLabel(setting.templateKey)}</DialogTitle>
          <DialogDescription>
            固定版式不开放 HTML；这里只改标题、链接、群名和联系邮箱。
          </DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4 md:grid-cols-2"
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
            <Button type="submit">
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
  triggerLabel = "查看邮件",
  description = "使用当前待发送名单中的第一位同学渲染。",
}: {
  title: string;
  html: string | null;
  triggerLabel?: string;
  description?: string;
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" disabled={!html}>
          <Eye data-icon="inline-start" />
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-5xl">
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
}: {
  recipients: FlowTarget["passed"];
  title: string;
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" disabled={recipients.length === 0}>
          <Users data-icon="inline-start" />
          查看收件人
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl">
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
  const subject = accept ? flow.acceptedSubject : flow.rejectedSubject;
  const previewHtml = accept ? flow.acceptedPreviewHtml : flow.rejectedPreviewHtml;
  const tone = accept ? "border-primary/25 bg-primary/5" : "border-destructive/20 bg-destructive/5";

  return (
    <div className={cn("flex flex-col gap-4 rounded-lg border p-4", tone)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold">
            {accept ? "通过通知" : "不通过通知"}
          </p>
          <p className="mt-1 break-words text-xs text-muted-foreground">{subject}</p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-semibold tabular-nums">{recipients.length}</p>
          <p className="text-xs text-muted-foreground">待发送</p>
        </div>
      </div>

      <div className="rounded-md border bg-background/70 p-3">
        <p className="text-sm text-muted-foreground">
          名单来自成绩管理中的{accept ? "通过" : "不通过"}状态。发送前可查看完整收件人列表。
        </p>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
        <RecipientsDialog
          recipients={recipients}
          title={`${flow.title} ${accept ? "通过通知" : "不通过通知"}收件人`}
        />
        <PreviewDialog
          title={`${flow.title} ${accept ? "通过通知" : "不通过通知"}`}
          html={previewHtml}
        />
        <Button
          size="sm"
          disabled={recipients.length === 0}
          onClick={() => {
            toast.promise(
              sendResultEmailFromFlow(flow.id, accept).then(() => router.refresh()),
              {
                loading: "正在创建批次并加入发送队列",
                success: "邮件已加入发送队列，结果已锁定",
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
  const selectedFlow = useMemo(
    () => flowTargets.find((flow) => flow.id === selectedFlowId) ?? flowTargets[0],
    [flowTargets, selectedFlowId],
  );

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
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            {templateSettings.map((setting) => (
              <TemplateDialog key={setting.templateKey} setting={setting} />
            ))}
          </div>
        </div>

        <div className="grid min-h-[420px] lg:grid-cols-[280px_minmax(0,1fr)]">
          <div className="border-b p-3 lg:border-b-0 lg:border-r">
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
            <div className="flex max-h-[360px] flex-col gap-2 overflow-y-auto pr-1">
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
                    <p className="mt-1 text-xs text-muted-foreground">
                      通过 {flow.passed.length} · 不通过 {flow.failed.length}
                    </p>
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

          <div className="p-4">
            {selectedFlow ? (
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-1">
                  <h3 className="text-lg font-semibold">{selectedFlow.title}</h3>
                  <p className="text-sm text-muted-foreground">
                    发送会创建邮件批次、保存 HTML 快照，并把对应结果锁定。
                  </p>
                </div>
                <div className="grid gap-4 xl:grid-cols-2">
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
              已创建的邮件批次和每个收件人的发送状态。
            </p>
          </div>
        </div>
        <div className="hidden overflow-x-auto p-4 md:block">
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
                    暂无发送记录。
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
                            title={`${batch.flowTitle} 邮件快照`}
                            html={preview}
                            triggerLabel="邮件快照"
                            description="这是该批次发送时保存的 HTML 内容。"
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
              暂无发送记录。
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
                      title={`${batch.flowTitle} 邮件快照`}
                      html={preview}
                      triggerLabel="邮件快照"
                      description="这是该批次发送时保存的 HTML 内容。"
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
