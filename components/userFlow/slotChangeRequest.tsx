"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarClock } from "lucide-react";
import { requestInterviewSlotChange } from "@/action/user-flow/interview-slot-change";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import dayjs from "@/lib/dayjs";

type PendingSlotChange = {
  id: number;
  requestedStartsAt: Date | null;
  requestedEndsAt: Date | null;
} | null;

/**
 * 候选人在自己的面试流程卡片里申请修改面试时间（技术部门）：
 * 给出希望改到的新时间，由预约讲师审批，同意后同步飞书日程。
 * 办公类时段调整已下线（改由部长直接修改），因此这里没有时段选项分支。
 * 申请理由必填，审批通过前仍按原安排进行。
 */
export function SlotChangeRequest({
  userFlowId,
  currentStartsAt,
  currentEndsAt,
  pending,
  editable,
}: {
  userFlowId: number;
  currentStartsAt: Date | null;
  currentEndsAt: Date | null;
  pending: PendingSlotChange;
  editable: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [startsAt, setStartsAt] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (!editable && !pending) return null;

  const pendingText = pending
    ? `改时间申请待审批：${
        pending.requestedStartsAt
          ? dayjs(pending.requestedStartsAt).format("YYYY-MM-DD HH:mm")
          : "待定"
      }`
    : null;
  const currentTimeText = currentStartsAt
    ? `${dayjs(currentStartsAt).format("YYYY-MM-DD HH:mm")} - ${dayjs(
        currentEndsAt ?? currentStartsAt,
      ).format("HH:mm")}`
    : "待定";

  const resetDraft = () => {
    setStartsAt(
      currentStartsAt ? dayjs(currentStartsAt).format("YYYY-MM-DDTHH:mm") : "",
    );
    setReason("");
  };

  const submit = async () => {
    if (!startsAt) {
      toast.error("请选择要改到的面试时间");
      return;
    }
    if (!reason.trim()) {
      toast.error("请填写申请理由");
      return;
    }
    setSubmitting(true);
    try {
      const result = await requestInterviewSlotChange({
        userFlowId,
        requestedStartsAt: startsAt,
        reason: reason.trim(),
      });
      if (!result.success) {
        toast.error(result.error.message);
        return;
      }
      toast.success("申请已提交，等待讲师审批");
      setOpen(false);
      resetDraft();
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "提交失败，请稍后重试",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-xs text-muted-foreground">
        {pendingText ??
          "面试时间不合适？提交申请，由预约讲师审批后同步调整日程。"}
      </p>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={!!pending}
        onClick={() => {
          resetDraft();
          setOpen(true);
        }}
        className="shrink-0 self-start sm:self-auto"
      >
        <CalendarClock data-icon="inline-start" />
        申请修改面试时间
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>申请修改面试时间</DialogTitle>
            <DialogDescription>
              当前面试时间：{currentTimeText}
              。提交后等待预约讲师审批，审批通过后飞书日程与面试时间会同步调整。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor={`slot-change-${userFlowId}`}>申请调整为</Label>
            <Input
              id={`slot-change-${userFlowId}`}
              type="datetime-local"
              value={startsAt}
              onChange={(event) => setStartsAt(event.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              面试时长沿用原日程；如需调整时长请联系讲师重新预约。
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor={`slot-change-reason-${userFlowId}`}>
              申请理由（必填）
            </Label>
            <Textarea
              id={`slot-change-reason-${userFlowId}`}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="如：与其他流程时间冲突"
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={submitting}
            >
              取消
            </Button>
            <Button
              type="button"
              onClick={submit}
              disabled={submitting || !reason.trim() || !startsAt}
              loading={submitting}
            >
              提交申请
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
