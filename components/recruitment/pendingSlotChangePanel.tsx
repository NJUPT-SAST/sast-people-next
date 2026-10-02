"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarClock } from "lucide-react";
import {
  reviewInterviewSlotChange,
  type PendingSlotChangeRow,
} from "@/action/user-flow/interview-slot-change";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import dayjs from "@/lib/dayjs";

type Decision = "approve" | "reject";

type PendingTarget = { row: PendingSlotChangeRow; decision: Decision };

const formatStartsAt = (value: Date | null) =>
  value ? dayjs(value).format("YYYY-MM-DD HH:mm") : "待定";

/**
 * 面试改约申请（技术部门）：只对预约该日程的讲师显示，同意后同步飞书日程与改约邮件。
 * 办公类时段调整已下线（由部长在面试管理页直接修改），不再出现在此列表。
 * 暂不改期必须填写说明，系统会邮件告知候选人。
 */
export function PendingSlotChangePanel({
  rows,
}: {
  rows: PendingSlotChangeRow[];
}) {
  const router = useRouter();
  const [target, setTarget] = useState<PendingTarget | null>(null);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (rows.length === 0) return null;

  const openDialog = (row: PendingSlotChangeRow, decision: Decision) => {
    setNote("");
    setTarget({ row, decision });
  };

  const submit = async () => {
    if (!target) return;
    const approved = target.decision === "approve";
    if (!approved && !note.trim()) {
      toast.error("请填写暂不改期的说明");
      return;
    }
    setSubmitting(true);
    try {
      const result = await reviewInterviewSlotChange(target.row.id, approved, {
        reviewNote: note.trim() || undefined,
      });
      if (!result.success) {
        toast.error(result.error.message);
        return;
      }
      toast.success(
        approved
          ? `已同意，面试时间已改为 ${formatStartsAt(
              result.appliedStartsAt ?? target.row.requestedStartsAt,
            )}，飞书日程与通知已同步`
          : "已告知候选人暂不改期，面试仍按原时间进行",
      );
      setTarget(null);
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "审批失败，请稍后重试",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="space-y-3 rounded-lg border bg-card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <CalendarClock
          className="size-4 shrink-0 text-muted-foreground"
          aria-hidden="true"
        />
        <h2 className="text-sm font-medium">面试改约申请</h2>
        <Badge variant="outline">{rows.length} 条</Badge>
      </div>
      <p className="text-xs leading-5 text-muted-foreground">
        候选人提交的改约申请只对你（预约讲师）显示。同意后同步调整飞书日程与留档会议，并发送改约邮件；暂不改期时请填写说明，系统会邮件告知候选人。
      </p>
      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>流程</TableHead>
              <TableHead>候选人</TableHead>
              <TableHead>学号</TableHead>
              <TableHead>当前时间 → 申请时间</TableHead>
              <TableHead>申请理由</TableHead>
              <TableHead>申请时间</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="max-w-52 truncate" title={row.flowTitle}>
                  {row.flowTitle}
                </TableCell>
                <TableCell className="font-medium">
                  {row.candidateName ?? "未知成员"}
                </TableCell>
                <TableCell className="font-mono text-xs">
                  {row.candidateStudentId ?? "-"}
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  <span className="text-muted-foreground">
                    {formatStartsAt(row.currentStartsAt)}
                  </span>
                  <span className="mx-1 text-muted-foreground">→</span>
                  <span className="font-medium">
                    {formatStartsAt(row.requestedStartsAt)}
                  </span>
                </TableCell>
                <TableCell className="max-w-56 whitespace-pre-wrap text-muted-foreground">
                  {row.reason}
                </TableCell>
                <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                  {dayjs(row.createdAt).format("YYYY-MM-DD HH:mm")}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => openDialog(row, "approve")}
                    >
                      同意改约
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => openDialog(row, "reject")}
                    >
                      暂不改期
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <Dialog
        open={target !== null}
        onOpenChange={(next) => {
          if (!next && !submitting) setTarget(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {target?.decision === "approve" ? "同意改约申请" : "暂不改期"}
            </DialogTitle>
            <DialogDescription>
              {target &&
                `${target.row.flowTitle} · ${target.row.candidateName ?? "该候选人"}：${formatStartsAt(
                  target.row.currentStartsAt,
                )} → ${formatStartsAt(target.row.requestedStartsAt)}`}
            </DialogDescription>
          </DialogHeader>
          {target?.decision === "approve" && (
            <p className="text-xs leading-5 text-muted-foreground">
              同意后将按申请时间同步飞书日程与留档会议，并邮件通知候选人。
            </p>
          )}
          <div className="space-y-2">
            <Label htmlFor="slot-review-note">
              {target?.decision === "reject" ? "说明（必填）" : "备注（选填）"}
            </Label>
            <Textarea
              id="slot-review-note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder={
                target?.decision === "approve"
                  ? "如：已与候选人确认"
                  : "如：这个时间讲师已有其他安排，请先按原时间参加，我们再帮你协调"
              }
            />
            {target?.decision === "reject" && (
              <p className="text-xs text-muted-foreground">
                说明会随邮件发送给候选人，请写明本次暂不调整的原因。
              </p>
            )}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setTarget(null)}
              disabled={submitting}
            >
              取消
            </Button>
            <Button
              type="button"
              onClick={submit}
              disabled={submitting || (target?.decision === "reject" && !note.trim())}
              loading={submitting}
            >
              {target?.decision === "approve" ? "确认同意" : "确认暂不改期"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
