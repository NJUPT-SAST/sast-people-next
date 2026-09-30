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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { isOfficeInterviewFlow, SLOT_CONFLICT_LABEL } from "@/const/flow";
import dayjs from "@/lib/dayjs";

/* 冲突时段的补充提示；选项标签已包含默认冲突文案时不再重复展示 */
const SLOT_CONFLICT_HINT = "（约面时间QQ群中另行通知）";

type SlotOption = { label: string; isConflict?: boolean };

type PendingSlotChange = {
  id: number;
  requestedSlot: string | null;
  requestedStartsAt: Date | null;
  requestedEndsAt: Date | null;
} | null;

/**
 * 候选人在自己的面试流程卡片里申请修改面试时间/时段。
 * 办公类部门面试：从流程配置的时段里选，由部长审批；
 * 技术部门面试：给出希望改到的新时间，由预约讲师审批（同意后同步飞书日程）。
 * 申请理由必填，审批通过前仍按原安排进行。
 */
export function SlotChangeRequest({
  userFlowId,
  flowType,
  currentSlot,
  currentStartsAt,
  currentEndsAt,
  slotOptions,
  pending,
  editable,
}: {
  userFlowId: number;
  flowType: string;
  currentSlot: string | null;
  currentStartsAt: Date | null;
  currentEndsAt: Date | null;
  slotOptions: SlotOption[];
  pending: PendingSlotChange;
  editable: boolean;
}) {
  const router = useRouter();
  const isOfficeFlow = isOfficeInterviewFlow(flowType);
  const [open, setOpen] = useState(false);
  const [slot, setSlot] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (!editable && !pending) return null;

  const pendingText = pending
    ? isOfficeFlow
      ? `改时段申请待审批：${pending.requestedSlot ?? "待定"}`
      : `改时间申请待审批：${
          pending.requestedStartsAt
            ? dayjs(pending.requestedStartsAt).format("YYYY-MM-DD HH:mm")
            : "待定"
        }`
    : null;
  const currentTimeText = isOfficeFlow
    ? (currentSlot ?? "未选择")
    : currentStartsAt
      ? `${dayjs(currentStartsAt).format("YYYY-MM-DD HH:mm")} - ${dayjs(
          currentEndsAt ?? currentStartsAt,
        ).format("HH:mm")}`
      : "待定";

  const resetDraft = () => {
    setSlot("");
    setStartsAt(
      currentStartsAt ? dayjs(currentStartsAt).format("YYYY-MM-DDTHH:mm") : "",
    );
    setReason("");
  };

  const submit = async () => {
    if (isOfficeFlow && !slot) {
      toast.error("请选择要改到的面试时段");
      return;
    }
    if (!isOfficeFlow && !startsAt) {
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
        requestedSlot: isOfficeFlow ? slot : undefined,
        requestedStartsAt: isOfficeFlow ? undefined : startsAt,
        reason: reason.trim(),
      });
      if (!result.success) {
        toast.error(result.error.message);
        return;
      }
      toast.success(
        isOfficeFlow ? "申请已提交，等待部长审批" : "申请已提交，等待讲师审批",
      );
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
          (isOfficeFlow
            ? "面试时段需要调整？提交申请，由部长审批后生效。"
            : "面试时间不合适？提交申请，由预约讲师审批后同步调整日程。")}
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
        {isOfficeFlow ? "申请修改面试时段" : "申请修改面试时间"}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {isOfficeFlow ? "申请修改面试时段" : "申请修改面试时间"}
            </DialogTitle>
            <DialogDescription>
              当前{isOfficeFlow ? "时段" : "面试时间"}：{currentTimeText}
              。提交后等待{isOfficeFlow ? "部长" : "预约讲师"}审批，
              {isOfficeFlow
                ? "审批通过前仍按当前时段安排。"
                : "审批通过后飞书日程与面试时间会同步调整。"}
            </DialogDescription>
          </DialogHeader>
          {isOfficeFlow ? (
            <div className="space-y-2">
              <Label htmlFor={`slot-change-${userFlowId}`}>申请调整为</Label>
              <Select value={slot} onValueChange={setSlot}>
                <SelectTrigger
                  id={`slot-change-${userFlowId}`}
                  className="w-full text-left [&_[data-slot=select-value]]:flex-1 [&_[data-slot=select-value]]:justify-start [&_[data-slot=select-value]]:text-left"
                >
                  <SelectValue placeholder="选择面试时段" />
                </SelectTrigger>
                <SelectContent>
                  {slotOptions.map((option) => (
                    <SelectItem key={option.label} value={option.label}>
                      {option.label}
                      {option.isConflict &&
                        !option.label.includes(SLOT_CONFLICT_LABEL) && (
                          <span className="text-xs text-muted-foreground">
                            {SLOT_CONFLICT_HINT}
                          </span>
                        )}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
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
          )}
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
              disabled={
                submitting ||
                !reason.trim() ||
                (isOfficeFlow ? !slot : !startsAt)
              }
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
