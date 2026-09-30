"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarClock } from "lucide-react";
import {
  reviewInterviewSlotChange,
  type PendingSlotChangeRow,
} from "@/action/user-flow/office-interview";
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

/** 部长审批：本部门待处理的面试时段变更申请 */
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
    setSubmitting(true);
    try {
      const result = await reviewInterviewSlotChange(
        target.row.id,
        approved,
        undefined,
        note.trim() || undefined,
      );
      if (!result.success) {
        toast.error(result.error.message);
        return;
      }
      toast.success(
        approved
          ? `已通过，面试时段更新为 ${result.appliedSlot ?? target.row.requestedSlot}`
          : "已驳回该改时段申请",
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
        <h2 className="text-sm font-medium">面试时段变更待审批</h2>
        <Badge variant="outline">{rows.length} 条</Badge>
      </div>
      <p className="text-xs leading-5 text-muted-foreground">
        候选人提交的改时段申请，通过后将按申请时段更新该报名记录。
      </p>
      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>候选人</TableHead>
              <TableHead>学号</TableHead>
              <TableHead>当前时段 → 申请时段</TableHead>
              <TableHead>理由</TableHead>
              <TableHead>申请时间</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="font-medium">
                  {row.candidateName ?? "未知成员"}
                </TableCell>
                <TableCell className="font-mono text-xs">
                  {row.candidateStudentId ?? "-"}
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  <span className="text-muted-foreground">
                    {row.currentSlot ?? "未选择"}
                  </span>
                  <span className="mx-1 text-muted-foreground">→</span>
                  <span className="font-medium">{row.requestedSlot}</span>
                </TableCell>
                <TableCell className="max-w-56 whitespace-pre-wrap text-muted-foreground">
                  {row.reason ?? "未填写"}
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
                      通过
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => openDialog(row, "reject")}
                    >
                      驳回
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
              {target?.decision === "approve" ? "通过改时段申请" : "驳回改时段申请"}
            </DialogTitle>
            <DialogDescription>
              {target &&
                `${target.row.candidateName ?? "该候选人"}：${
                  target.row.currentSlot ?? "未选择"
                } → ${target.row.requestedSlot}`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="slot-review-note">备注（选填）</Label>
            <Textarea
              id="slot-review-note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder={
                target?.decision === "approve"
                  ? "如：已与候选人确认"
                  : "如：该时段已满，请重新选择"
              }
            />
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
              variant={target?.decision === "reject" ? "destructive" : "default"}
              onClick={submit}
              loading={submitting}
            >
              {target?.decision === "approve" ? "确认通过" : "确认驳回"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
