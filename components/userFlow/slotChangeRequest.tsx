"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarClock } from "lucide-react";
import { requestInterviewSlotChange } from "@/action/user-flow/office-interview";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { SLOT_CONFLICT_LABEL } from "@/const/flow";

/* 冲突时段的补充提示；选项标签已包含默认冲突文案时不再重复展示 */
const SLOT_CONFLICT_HINT = "（约面时间QQ群中另行通知）";

type SlotOption = { label: string; isConflict?: boolean };

/**
 * 候选人在自己的面试流程卡片里申请修改面试时段。
 * 提交后进入部长审批队列，审批通过前仍按原时段安排。
 */
export function SlotChangeRequest({
  userFlowId,
  currentSlot,
  slotOptions,
  pendingRequestedSlot,
  editable,
}: {
  userFlowId: number;
  currentSlot: string | null;
  slotOptions: SlotOption[];
  pendingRequestedSlot: string | null;
  editable: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [slot, setSlot] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (!editable && !pendingRequestedSlot) return null;

  const submit = async () => {
    setSubmitting(true);
    try {
      const result = await requestInterviewSlotChange(
        userFlowId,
        slot,
        reason.trim() || undefined,
      );
      if (!result.success) {
        toast.error(result.error.message);
        return;
      }
      toast.success("申请已提交，等待部长审批");
      setOpen(false);
      setSlot("");
      setReason("");
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
        {pendingRequestedSlot
          ? `改时段申请待审批：${pendingRequestedSlot}`
          : "面试时段需要调整？提交申请，由部长审批后生效。"}
      </p>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={!!pendingRequestedSlot}
        onClick={() => {
          setSlot("");
          setReason("");
          setOpen(true);
        }}
        className="shrink-0 self-start sm:self-auto"
      >
        <CalendarClock data-icon="inline-start" />
        申请修改面试时段
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>申请修改面试时段</DialogTitle>
            <DialogDescription>
              当前时段：{currentSlot ?? "未选择"}。提交后等待部长审批，审批通过前仍按当前时段安排。
            </DialogDescription>
          </DialogHeader>
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
          <div className="space-y-2">
            <Label htmlFor={`slot-change-reason-${userFlowId}`}>
              申请理由（选填）
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
              disabled={!slot}
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
