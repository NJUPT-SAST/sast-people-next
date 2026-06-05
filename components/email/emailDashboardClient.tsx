"use client";

import { recoverStaleEmailBatch, sendEmailBatch } from "@/action/email/send";
import {
  resetInterviewScheduleEmailTemplate,
  updateInterviewScheduleEmailTemplate,
} from "@/action/email/interview-template";
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
import { Textarea } from "@/components/ui/textarea";
import {
  getEducationEmailLabel,
  getEmailPreflight,
  getQueueableEmailRecipients,
} from "@/components/email/emailDashboardUtils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import {
  AlertCircle,
  CheckCircle2,
  Eye,
  RotateCcw,
  Save,
  Search,
  Send,
  Settings2,
  Users,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
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
type InterviewScheduleTemplate = Awaited<
  ReturnType<typeof import("@/action/email/interview-template").getInterviewScheduleEmailTemplate>
>;

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
const EMAIL_REFRESH_INTERVAL_MS = 3000;
const EMAIL_REFRESH_MAX_ATTEMPTS = 20;

function getBatchStatusBadgeClass(status: string) {
  if (status === "completed") {
    return "border-transparent bg-primary text-primary-foreground";
  }
  if (status === "failed") {
    return "border-transparent bg-destructive text-destructive-foreground";
  }
  if (status === "queued") {
    return "border-transparent bg-chart-3 text-background";
  }
  return "border-transparent bg-muted text-muted-foreground";
}

function getDeliveryStatusBadgeClass(status: string) {
  if (status === "sent") {
    return "border-transparent bg-primary text-primary-foreground";
  }
  if (status === "failed") {
    return "border-transparent bg-destructive text-destructive-foreground";
  }
  if (status === "sending") {
    return "border-transparent bg-chart-3 text-background";
  }
  return "border-transparent bg-muted text-muted-foreground";
}

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

function getLaneDeliveries({
  batches,
  flowId,
  accept,
}: {
  batches: EmailBatch[];
  flowId: number;
  accept: boolean;
}) {
  const safeBatches = Array.isArray(batches) ? batches : [];
  return safeBatches
    .filter((batch) => batch.flowId === flowId && batch.accept === accept)
    .flatMap((batch) => (Array.isArray(batch.deliveries) ? batch.deliveries : []));
}

function countRemainingRecipients({
  recipients,
  deliveries,
}: {
  recipients: Array<FlowTarget["passed"][number]>;
  deliveries: EmailBatch["deliveries"];
}) {
  return getQueueableEmailRecipients({
    recipients: Array.isArray(recipients) ? recipients : [],
    deliveries: Array.isArray(deliveries) ? deliveries : [],
  }).length;
}

function FlowSummary({
  flow,
  batches,
}: {
  flow: FlowTarget;
  batches: EmailBatch[];
}) {
  const unsent =
    countRemainingRecipients({
      recipients: Array.isArray(flow.passed) ? flow.passed : [],
      deliveries: getLaneDeliveries({ batches, flowId: flow.id, accept: true }),
    }) +
    countRemainingRecipients({
      recipients: Array.isArray(flow.failed) ? flow.failed : [],
      deliveries: getLaneDeliveries({ batches, flowId: flow.id, accept: false }),
    });

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
  interviewScheduleTemplate,
  interviewSchedulePreviewHtml,
}: {
  templateSettings: TemplateSetting[];
  interviewScheduleTemplate: InterviewScheduleTemplate;
  interviewSchedulePreviewHtml: string | null;
}) {
  const safeTemplateSettings = Array.isArray(templateSettings) ? templateSettings : [];
  return (
    <div className="grid grid-cols-2 gap-2 lg:hidden">
      {safeTemplateSettings.map((setting) => (
        <TemplateDialog key={setting.templateKey} setting={setting} />
      ))}
      <InterviewTemplateDialog
        setting={interviewScheduleTemplate}
        previewHtml={interviewSchedulePreviewHtml}
      />
    </div>
  );
}

function DesktopTemplateActions({
  templateSettings,
  interviewScheduleTemplate,
  interviewSchedulePreviewHtml,
}: {
  templateSettings: TemplateSetting[];
  interviewScheduleTemplate: InterviewScheduleTemplate;
  interviewSchedulePreviewHtml: string | null;
}) {
  const safeTemplateSettings = Array.isArray(templateSettings) ? templateSettings : [];
  return (
    <div className="hidden gap-2 lg:flex lg:flex-wrap">
      {safeTemplateSettings.map((setting) => (
        <TemplateDialog key={setting.templateKey} setting={setting} />
      ))}
      <InterviewTemplateDialog
        setting={interviewScheduleTemplate}
        previewHtml={interviewSchedulePreviewHtml}
      />
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
  const isAcceptedTemplate = setting.templateKey.endsWith("accepted");

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
            {isAcceptedTemplate
              ? "邮件版式固定；这里只调整链接、飞书群和联系邮箱。"
              : "邮件版式固定；这里只调整活动日历和联系邮箱。"}
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
              id={`${setting.templateKey}-calendar-url`}
              label="活动日历链接"
              name="calendarUrl"
              defaultValue={setting.calendarUrl}
            />
            {isAcceptedTemplate ? (
              <>
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
                />
              </>
            ) : (
              <>
                <input type="hidden" name="memberFormLabel" value={setting.memberFormLabel} />
                <input type="hidden" name="feishuGroupName" value={setting.feishuGroupName} />
              </>
            )}
          </div>

          {isAcceptedTemplate ? (
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
                id={`${setting.templateKey}-help-url`}
                label="飞书注册说明"
                name="feishuRegisterHelpUrl"
                defaultValue={setting.feishuRegisterHelpUrl}
              />
            </div>
          ) : (
            <>
              <input type="hidden" name="memberInfoFormUrl" value={setting.memberInfoFormUrl} />
              <input type="hidden" name="feishuGroupUrl" value={setting.feishuGroupUrl} />
              <input
                type="hidden"
                name="feishuRegisterHelpUrl"
                value={setting.feishuRegisterHelpUrl}
              />
            </>
          )}
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

function createInterviewTemplateValues(form: HTMLFormElement) {
  const data = new FormData(form);
  return {
    subjectTemplate: String(data.get("subjectTemplate") ?? ""),
    titleTemplate: String(data.get("titleTemplate") ?? ""),
    bodyTemplate: String(data.get("bodyTemplate") ?? ""),
    footerText: String(data.get("footerText") ?? ""),
  };
}

function InterviewTemplateDialog({
  setting,
  previewHtml,
}: {
  setting: InterviewScheduleTemplate;
  previewHtml: string | null;
}) {
  const router = useRouter();
  const variableText =
    "{candidateName}、{flowName}、{organizerName}、{startsAt}、{endsAt}、{meetingLink}";

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="w-full sm:w-auto">
          <Settings2 data-icon="inline-start" />
          面试通知模板
        </Button>
      </DialogTrigger>
      <DialogContent
        className={cn(
          "max-h-[85dvh] w-[calc(100vw-2rem)] max-w-3xl overflow-y-auto",
          hiddenScrollbar,
        )}
      >
        <DialogHeader>
          <DialogTitle>面试通知模板</DialogTitle>
          <DialogDescription>
            用于预约飞书会议后发送给面试者；正文必须保留时间和会议链接变量。
          </DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            const values = createInterviewTemplateValues(event.currentTarget);
            toast.promise(
              updateInterviewScheduleEmailTemplate(values).then((result) => {
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
          <div className="rounded-lg border bg-muted/10 p-3">
            <p className="text-xs font-medium text-muted-foreground">可用变量</p>
            <p className="mt-1 break-words text-xs text-muted-foreground">
              {variableText}
            </p>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <TemplateField
              id="interview-subject-template"
              name="subjectTemplate"
              label="邮件标题"
              defaultValue={setting.subjectTemplate}
            />
            <TemplateField
              id="interview-title-template"
              name="titleTemplate"
              label="邮件主标题"
              defaultValue={setting.titleTemplate}
            />
          </div>

          <div className="flex min-w-0 flex-col gap-1.5">
            <Label htmlFor="interview-body-template" className="text-xs text-muted-foreground">
              正文说明
            </Label>
            <Textarea
              id="interview-body-template"
              name="bodyTemplate"
              defaultValue={setting.bodyTemplate}
              className="min-h-[120px] resize-y"
            />
          </div>

          <TemplateField
            id="interview-footer-text"
            name="footerText"
            label="落款"
            defaultValue={setting.footerText}
          />

          <div className="flex flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:justify-between">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                toast.promise(
                  resetInterviewScheduleEmailTemplate().then(() => router.refresh()),
                  {
                    loading: "正在重置模板",
                    success: "模板已重置",
                    error: (error) =>
                      error instanceof Error ? error.message : "重置失败",
                  },
                );
              }}
            >
              恢复默认
            </Button>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <PreviewDialog
                title="面试通知模板样张"
                html={previewHtml}
                triggerLabel="预览"
                description="样张使用固定示例数据；真实发送时会替换为预约信息。"
              />
              <Button type="submit">
                <Save data-icon="inline-start" />
                保存模板
              </Button>
            </div>
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
  description = "收件地址固定按学号生成，不使用个人资料中的邮箱字段。",
}: {
  recipients: FlowTarget["passed"];
  title: string;
  triggerLabel?: string;
  description?: string;
}) {
  const safeRecipients = Array.isArray(recipients) ? recipients : [];
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          disabled={safeRecipients.length === 0}
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
          <DialogDescription>{description}</DialogDescription>
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
              {safeRecipients.map((item) => (
                <TableRow key={item.userId}>
                  <TableCell>{item.name}</TableCell>
                  <TableCell>{item.studentId}</TableCell>
                  <TableCell className="font-mono text-xs">
                    {getEducationEmailLabel(item.studentId)}
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

function SendCheckItem({
  status,
  label,
  detail,
}: {
  status: "ok" | "warning" | "error";
  label: string;
  detail: string;
}) {
  const Icon = status === "ok" ? CheckCircle2 : AlertCircle;

  return (
    <div className="flex items-start gap-3 rounded-md border bg-background px-3 py-2.5">
      <Icon
        className={cn(
          "mt-0.5 h-4 w-4 shrink-0",
          status === "ok" && "text-primary",
          status === "warning" && "text-muted-foreground",
          status === "error" && "text-destructive",
        )}
      />
      <div className="min-w-0">
        <p className="text-sm font-medium">{label}</p>
        <p className="mt-0.5 break-words text-xs text-muted-foreground">
          {detail}
        </p>
      </div>
    </div>
  );
}

function SendConfirmDialog({
  flow,
  accept,
  subject,
  previewHtml,
  recipients,
  deliveries,
}: {
  flow: FlowTarget;
  accept: boolean;
  subject: string;
  previewHtml: string | null;
  recipients: FlowTarget["passed"];
  deliveries: EmailBatch["deliveries"];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const resultLabel = accept ? "通过" : "不通过";
  const preflight = getEmailPreflight({
    recipients: Array.isArray(recipients) ? recipients : [],
    deliveries: Array.isArray(deliveries) ? deliveries : [],
  });
  const invalidNames = preflight.invalidRecipients
    .map((recipient) => recipient.name)
    .join("、");
  const totalRecipientCount = Array.isArray(recipients) ? recipients.length : 0;
  const hasPreview = Boolean(previewHtml);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          size="sm"
          className="w-full"
          disabled={preflight.remainingRecipients.length === 0}
        >
          <Send data-icon="inline-start" />
          发送
        </Button>
      </DialogTrigger>
      <DialogContent
        className={cn(
          "max-h-[85dvh] w-[calc(100vw-2rem)] max-w-2xl overflow-y-auto",
          hiddenScrollbar,
        )}
      >
        <DialogHeader>
          <DialogTitle>确认发送{resultLabel}邮件</DialogTitle>
          <DialogDescription>
            系统只会为未创建过发送记录的同学创建邮件；已有记录请在发送记录里重试。
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <div className="rounded-lg border bg-muted/20 p-3">
            <p className="text-xs text-muted-foreground">流程</p>
            <p className="mt-1 font-medium">{flow.title}</p>
            <p className="mt-2 break-words text-xs text-muted-foreground">
              {subject}
            </p>
          </div>

          <div className="grid grid-cols-3 gap-2 text-sm">
            <div className="rounded-md border bg-background p-3">
              <p className="text-xs text-muted-foreground">待发送</p>
              <p className="mt-1 text-lg font-semibold tabular-nums">
                {preflight.remainingRecipients.length}
              </p>
            </div>
            <div className="rounded-md border bg-background p-3">
              <p className="text-xs text-muted-foreground">已有记录</p>
              <p className="mt-1 text-lg font-semibold tabular-nums">
                {preflight.alreadyCreatedCount}
              </p>
            </div>
            <div className="rounded-md border bg-background p-3">
              <p className="text-xs text-muted-foreground">缺学号</p>
              <p className="mt-1 text-lg font-semibold tabular-nums">
                {preflight.invalidRecipients.length}
              </p>
            </div>
          </div>

          <div className="grid gap-2">
            <SendCheckItem
              status={preflight.remainingRecipients.length > 0 ? "ok" : "error"}
              label="目标名单"
              detail={`当前${resultLabel}名单 ${totalRecipientCount} 人，本次会处理 ${preflight.remainingRecipients.length} 人。`}
            />
            <SendCheckItem
              status={preflight.invalidRecipients.length === 0 ? "ok" : "error"}
              label="教育邮箱"
              detail={
                preflight.invalidRecipients.length === 0
                  ? "待发名单都有学号，可以自动生成教育邮箱。"
                  : `${preflight.invalidRecipients.length} 人缺少学号，不能自动生成教育邮箱。`
              }
            />
            <SendCheckItem
              status={hasPreview ? "ok" : "error"}
              label="邮件样张"
              detail={
                hasPreview
                  ? "模板样张已生成，发送前可以打开核对正文。"
                  : "当前没有模板样张，请先检查模板配置。"
              }
            />
            <SendCheckItem
              status={preflight.alreadyCreatedCount === 0 ? "ok" : "warning"}
              label="重复发送"
              detail={
                preflight.alreadyCreatedCount === 0
                  ? "没有已有发送记录。"
                  : `${preflight.alreadyCreatedCount} 人已有发送记录，本次不会重复创建。`
              }
            />
          </div>

          {preflight.invalidRecipients.length > 0 && (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">
              <p className="font-medium text-destructive">
                不能发送：待发名单中有人缺少学号
              </p>
              <p className="mt-1 break-words text-xs text-muted-foreground">
                {invalidNames}
              </p>
            </div>
          )}

          <div className="grid gap-2 sm:grid-cols-2">
            <RecipientsDialog
              recipients={preflight.remainingRecipients}
              title={`${flow.title} ${resultLabel}邮件待发名单`}
              triggerLabel="查看待发名单"
              description="确认无误后再发送；教育邮箱由学号自动生成。"
            />
            <PreviewDialog
              title={`${flow.title} ${resultLabel}邮件样张`}
              html={previewHtml}
              triggerLabel="查看样张"
              triggerClassName="w-full"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setOpen(false)}>
              取消
            </Button>
            <Button
              disabled={!preflight.canSend || !hasPreview}
              onClick={() => {
                toast.promise(
                  sendResultEmailFromFlow(flow.id, accept).then(() => {
                    setOpen(false);
                    router.refresh();
                  }),
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
              确认发送
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function StatusDialog({ batch }: { batch: EmailBatch }) {
  const deliveries = Array.isArray(batch.deliveries) ? batch.deliveries : [];
  const failedCount = deliveries.filter((delivery) => delivery.status === "failed").length;
  const sentCount = deliveries.filter((delivery) => delivery.status === "sent").length;
  const renderDeliveryStatus = (status: string) => (
    <Badge variant="outline" className={getDeliveryStatusBadgeClass(status)}>
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
          "max-h-[88dvh] w-[calc(100vw-1rem)] max-w-none overflow-y-auto p-5 sm:w-[min(960px,calc(100vw-2rem))] sm:max-w-none sm:p-6",
          hiddenScrollbar,
        )}
      >
        <DialogHeader className="pr-8">
          <DialogTitle>{batch.flowTitle} 发送明细</DialogTitle>
          <DialogDescription>
            每位收件人的发送状态和失败原因会保留在这里。
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-md border bg-muted/20 px-3 py-2">
            <p className="text-xs text-muted-foreground">总数</p>
            <p className="mt-1 text-lg font-semibold tabular-nums">{deliveries.length}</p>
          </div>
          <div className="rounded-md border bg-muted/20 px-3 py-2">
            <p className="text-xs text-muted-foreground">已发送</p>
            <p className="mt-1 text-lg font-semibold tabular-nums text-primary">{sentCount}</p>
          </div>
          <div className="rounded-md border bg-muted/20 px-3 py-2">
            <p className="text-xs text-muted-foreground">失败</p>
            <p className="mt-1 text-lg font-semibold tabular-nums text-destructive">{failedCount}</p>
          </div>
        </div>

        <div
          className={cn(
            "flex max-h-[68dvh] flex-col gap-2 overflow-y-auto pr-1 md:hidden",
            hiddenScrollbar,
          )}
        >
          {deliveries.map((delivery) => (
            <div key={delivery.id} className="rounded-md border bg-card px-3 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold leading-5">
                    {delivery.userName}
                  </p>
                  <p className="mt-1 truncate font-mono text-xs text-muted-foreground">
                    {delivery.toAddress}
                  </p>
                </div>
                <div className="shrink-0">
                  {renderDeliveryStatus(delivery.status)}
                </div>
              </div>
              <div className="mt-3 grid grid-cols-[64px_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-sm">
                <span className="text-muted-foreground">发送时间</span>
                <span className="text-right tabular-nums">
                  {formatDate(delivery.sentAt)}
                </span>
                <span className="text-muted-foreground">失败原因</span>
                <div className="min-w-0 text-right">
                  <span
                    className={cn(
                      "break-words",
                      delivery.errorMessage && "text-destructive",
                    )}
                  >
                    {delivery.errorMessage ?? "-"}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div
          className={cn(
            "hidden max-h-[56vh] overflow-y-auto rounded-md border md:block",
            hiddenScrollbar,
          )}
        >
          <Table className="table-fixed" containerClassName="overflow-visible">
            <TableHeader>
              <TableRow>
                <TableHead className="w-[18%]">姓名</TableHead>
                <TableHead className="w-[30%]">收件地址</TableHead>
                <TableHead className="w-[12%]">状态</TableHead>
                <TableHead className="w-[18%]">发送时间</TableHead>
                <TableHead className="w-[22%]">失败原因</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {deliveries.map((delivery) => (
                <TableRow key={delivery.id}>
                  <TableCell className="truncate font-medium" title={delivery.userName}>
                    {delivery.userName}
                  </TableCell>
                  <TableCell className="truncate font-mono text-sm" title={delivery.toAddress}>
                    {delivery.toAddress}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {renderDeliveryStatus(delivery.status)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                    {formatDate(delivery.sentAt)}
                  </TableCell>
                  <TableCell
                    className={cn(
                      "truncate text-sm",
                      delivery.errorMessage
                        ? "text-destructive"
                        : "text-muted-foreground",
                    )}
                    title={delivery.errorMessage ?? "-"}
                  >
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

function TestEmailButton({ flowName }: { flowName?: string }) {
  const [address, setAddress] = useState("");
  const [accept, setAccept] = useState(true);

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
            使用当前结果邮件模板发送样张；仅支持南邮教育邮箱，也可以直接输入学号。
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-2">
          <Button
            type="button"
            variant={accept ? "default" : "outline"}
            size="sm"
            onClick={() => setAccept(true)}
          >
            通过邮件
          </Button>
          <Button
            type="button"
            variant={!accept ? "default" : "outline"}
            size="sm"
            onClick={() => setAccept(false)}
          >
            不通过邮件
          </Button>
        </div>
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
              sendEmailTest(address, accept, flowName).then((result) => {
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
          发送{accept ? "通过" : "不通过"}测试邮件
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
  const recipients = Array.isArray(accept ? flow.passed : flow.failed)
    ? accept
      ? flow.passed
      : flow.failed
    : [];
  const subject = accept ? flow.acceptedSubject : flow.rejectedSubject;
  const previewHtml = accept ? flow.acceptedPreviewHtml : flow.rejectedPreviewHtml;
  const tone = accept ? "border-primary/25 bg-primary/5" : "border-destructive/20 bg-destructive/5";
  const resultLabel = accept ? "通过" : "不通过";
  const laneDeliveries = getLaneDeliveries({ batches, flowId: flow.id, accept });
  const preflight = getEmailPreflight({ recipients, deliveries: laneDeliveries });
  const newRecipientCount = preflight.remainingRecipients.length;
  const sentCount = laneDeliveries.filter((delivery) => delivery.status === "sent").length;

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
            recipients={preflight.remainingRecipients}
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
        <SendConfirmDialog
          flow={flow}
          accept={accept}
          subject={subject}
          previewHtml={previewHtml}
          recipients={recipients}
          deliveries={laneDeliveries}
        />
      </div>
    </div>
  );
}

function RecoverStaleBatchButton({ batchId }: { batchId: number }) {
  const router = useRouter();

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => {
        toast.promise(
          recoverStaleEmailBatch(batchId).then((result) => {
            router.refresh();
            return result;
          }),
          {
            loading: "正在检查中断任务",
            success: (result) =>
              result.recoveredCount > 0
                ? `已恢复 ${result.recoveredCount} 封，可重新重试`
                : "没有超过 10 分钟的中断任务",
            error: (error) =>
              error instanceof Error ? error.message : "恢复失败",
          },
        );
      }}
    >
      <RotateCcw data-icon="inline-start" />
      恢复中断
    </Button>
  );
}

export function EmailDashboardClient({
  batches,
  flowTargets,
  templateSettings,
  interviewScheduleTemplate,
  interviewSchedulePreviewHtml,
}: {
  batches: EmailBatch[];
  flowTargets: FlowTarget[];
  templateSettings: TemplateSetting[];
  interviewScheduleTemplate: InterviewScheduleTemplate;
  interviewSchedulePreviewHtml: string | null;
}) {
  const router = useRouter();
  const safeBatches = useMemo(() => (Array.isArray(batches) ? batches : []), [batches]);
  const safeFlowTargets = useMemo(
    () => (Array.isArray(flowTargets) ? flowTargets : []),
    [flowTargets],
  );
  const safeTemplateSettings = useMemo(
    () => (Array.isArray(templateSettings) ? templateSettings : []),
    [templateSettings],
  );
  const [selectedFlowId, setSelectedFlowId] = useState(safeFlowTargets[0]?.id);
  const [flowQuery, setFlowQuery] = useState("");
  const refreshAttemptsRef = useRef(0);
  const hasActiveEmailWork = useMemo(
    () =>
      safeBatches.some(
        (batch) =>
          batch.status === "draft" ||
          batch.status === "queued" ||
          (Array.isArray(batch.deliveries) ? batch.deliveries : []).some(
            (delivery) =>
              delivery.status === "pending" || delivery.status === "sending",
          ),
      ),
    [safeBatches],
  );
  const filteredFlows = useMemo(() => {
    const query = flowQuery.trim().toLowerCase();
    if (!query) return safeFlowTargets;
    return safeFlowTargets.filter((flow) =>
      flow.title.toLowerCase().includes(query),
    );
  }, [flowQuery, safeFlowTargets]);
  const selectedFlow = useMemo(() => {
    const selected = safeFlowTargets.find((flow) => flow.id === selectedFlowId);
    if (!flowQuery.trim()) return selected ?? safeFlowTargets[0];
    if (selected && filteredFlows.some((flow) => flow.id === selected.id)) {
      return selected;
    }
    return filteredFlows[0] ?? selected ?? safeFlowTargets[0];
  }, [filteredFlows, flowQuery, safeFlowTargets, selectedFlowId]);

  useEffect(() => {
    if (!hasActiveEmailWork) {
      refreshAttemptsRef.current = 0;
      return;
    }

    const timer = window.setInterval(() => {
      if (refreshAttemptsRef.current >= EMAIL_REFRESH_MAX_ATTEMPTS) {
        window.clearInterval(timer);
        return;
      }
      refreshAttemptsRef.current += 1;
      router.refresh();
    }, EMAIL_REFRESH_INTERVAL_MS);

    return () => window.clearInterval(timer);
  }, [hasActiveEmailWork, router]);

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
            <TestEmailButton flowName={selectedFlow?.title} />
            <DesktopTemplateActions
              templateSettings={safeTemplateSettings}
              interviewScheduleTemplate={interviewScheduleTemplate}
              interviewSchedulePreviewHtml={interviewSchedulePreviewHtml}
            />
          </div>
        </div>

        <div className="border-b p-3 lg:hidden">
          <div className="rounded-lg border bg-background/35 p-3">
            <div className="mb-2">
              <TestEmailButton flowName={selectedFlow?.title} />
            </div>
            <MobileTemplateActions
              templateSettings={safeTemplateSettings}
              interviewScheduleTemplate={interviewScheduleTemplate}
              interviewSchedulePreviewHtml={interviewSchedulePreviewHtml}
            />
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
              <FlowSummary flow={selectedFlow} batches={safeBatches} />
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
                    <FlowSummary flow={flow} batches={safeBatches} />
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
                  <SendLane flow={selectedFlow} accept batches={safeBatches} />
                  <SendLane flow={selectedFlow} accept={false} batches={safeBatches} />
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
                <TableHead>操作人</TableHead>
                <TableHead>创建时间</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {safeBatches.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="h-20 text-center text-muted-foreground">
                    暂无发送记录。已有“邮件已发”状态的人员会计入上方已发人数。
                  </TableCell>
                </TableRow>
              ) : (
                safeBatches.map((batch) => {
                  const deliveries = Array.isArray(batch.deliveries) ? batch.deliveries : [];
                  const preview = deliveries[0]?.htmlSnapshot ?? null;
                  const canRetry = batch.counts.pending > 0 || batch.counts.failed > 0;
                  const canRecover = batch.counts.sending > 0;
                  return (
                    <TableRow key={batch.id}>
                      <TableCell>
                        <div className="font-medium">{batch.flowTitle}</div>
                        <div className="text-xs text-muted-foreground">{batch.subject}</div>
                      </TableCell>
                      <TableCell>{batch.accept ? "通过" : "不通过"}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={getBatchStatusBadgeClass(batch.status)}>
                          {batchStatusText[batch.status]}
                        </Badge>
                      </TableCell>
                      <TableCell>{batch.totalCount}</TableCell>
                      <TableCell>{batch.counts.sent}</TableCell>
                      <TableCell>{batch.counts.failed}</TableCell>
                      <TableCell>{batch.createdByName ?? "-"}</TableCell>
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
                          {canRecover && (
                            <RecoverStaleBatchButton batchId={batch.id} />
                          )}
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
          {safeBatches.length === 0 ? (
            <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
              暂无发送记录。已有“邮件已发”状态的人员会计入上方已发人数。
            </div>
          ) : (
            safeBatches.map((batch) => {
              const deliveries = Array.isArray(batch.deliveries) ? batch.deliveries : [];
              const preview = deliveries[0]?.htmlSnapshot ?? null;
              const canRetry = batch.counts.pending > 0 || batch.counts.failed > 0;
              const canRecover = batch.counts.sending > 0;
              return (
                <div key={batch.id} className="rounded-md border p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{batch.flowTitle}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {batch.accept ? "通过" : "不通过"} · {formatDate(batch.createdAt)}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        操作人：{batch.createdByName ?? "-"}
                      </p>
                    </div>
                    <Badge variant="outline" className={getBatchStatusBadgeClass(batch.status)}>
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
                    {canRecover && (
                      <RecoverStaleBatchButton batchId={batch.id} />
                    )}
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
