"use client";

import React, { useState } from "react";
import { toast } from "sonner";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../ui/dialog";
import { unregister } from "@/action/user-flow/unregister";

export const CancelRegistration = ({ userFlowId }: { userFlowId: number }) => {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleCancel = async () => {
    setLoading(true);
    try {
      const result = await unregister(userFlowId);
      if (!result.success) {
        toast.error(result.error?.message ?? "取消失败");
        return;
      }
      toast.success("已取消报名");
      setOpen(false);
    } catch {
      toast.error("取消失败，请稍后重试");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive">
          取消报名
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>确认取消报名</DialogTitle>
          <DialogDescription>
            取消后将退出当前流程，此操作不可撤销，确定要取消报名吗？
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={loading}>
            我再想想
          </Button>
          <Button variant="destructive" onClick={handleCancel} loading={loading}>
            确认取消
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
