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
import {
  getEducationEmailLabel,
  getEmailPreflight,
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
import { Send, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { hiddenScrollbar } from "./emailDashboardConstants";
import { PreviewDialog } from "./emailDashboardDialogs";
import type { EmailBatch, FlowTarget } from "./emailDashboardTypes";

export function RecipientsDialog({
  recipients,
  title,
  triggerLabel = "名单",
  description = "教育邮箱由学号生成。",
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
  const hasPreview = Boolean(previewHtml);
  const remaining = preflight.remainingRecipients.length;
  const skipped = preflight.alreadyCreatedCount;
  const invalidCount = preflight.invalidRecipients.length;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          size="sm"
          className="w-full"
          disabled={remaining === 0}
        >
          <Send data-icon="inline-start" />
          发送
        </Button>
      </DialogTrigger>
      <DialogContent
        className={cn(
          "max-h-[85dvh] w-[calc(100vw-2rem)] max-w-md overflow-y-auto",
          hiddenScrollbar,
        )}
      >
        <DialogHeader>
          <DialogTitle>发送{resultLabel}通知</DialogTitle>
          <DialogDescription>
            {flow.title}
            {subject ? ` · ${subject}` : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            将发送给{" "}
            <span className="font-semibold text-foreground tabular-nums">
              {remaining}
            </span>{" "}
            人
            {skipped > 0 ? `（已跳过 ${skipped} 人）` : ""}
            。
          </p>

          {invalidCount > 0 && (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">
              <p className="font-medium text-destructive">
                {invalidCount} 人缺少学号，无法发送
              </p>
              <p className="mt-1 break-words text-xs text-muted-foreground">
                {invalidNames}
              </p>
            </div>
          )}

          {!hasPreview && (
            <p className="text-sm text-destructive">
              没有可用预览，请先检查模板。
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            <RecipientsDialog
              recipients={preflight.remainingRecipients}
              title={`${flow.title} · ${resultLabel} · 待发名单`}
            />
            <PreviewDialog
              title={`${flow.title} · ${resultLabel}`}
              html={previewHtml}
              triggerLabel="预览"
              triggerSize="sm"
            />
          </div>

          <div className="flex justify-end gap-2">
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
                    loading: "正在发送…",
                    success: "已开始发送",
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