"use client";

import { sendResultEmailFromFlow } from "@/action/email/workspace";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { getEducationEmailLabel, getEmailPreflight } from "@/components/email/emailDashboardUtils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { AlertCircle, CheckCircle2, Send, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { hiddenScrollbar } from "./emailDashboardConstants";
import { PreviewDialog } from "./emailDashboardDialogs";
import type { EmailBatch, FlowTarget } from "./emailDashboardTypes";

export function RecipientsDialog({
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
          className="w-full lg:w-auto"
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

export function SendConfirmDialog({
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
