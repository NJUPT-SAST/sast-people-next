"use client";

import { TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * 关闭编辑器时的「还有未保存改动」确认。
 *
 * 模板编辑是「先改草稿、再点保存」，以前点遮罩或按 Esc 会直接关掉、改动无声消失；
 * 这里给出三条明确出口：继续编辑 / 放弃修改 / 保存并关闭。
 */
export function EmailUnsavedChangesDialog({
  open,
  onOpenChange,
  onDiscard,
  onSave,
  canSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDiscard: () => void;
  onSave: () => void;
  canSave: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TriangleAlert className="size-4 text-amber-500" aria-hidden="true" />
            还有未保存的改动
          </DialogTitle>
          <DialogDescription>
            现在关闭会丢掉刚才的修改，模板仍然保持上次保存的样子。
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:justify-between">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            继续编辑
          </Button>
          <span className="flex flex-col-reverse gap-2 sm:flex-row">
            <Button type="button" variant="outline" onClick={onDiscard}>
              放弃修改并关闭
            </Button>
            {canSave && (
              <Button type="button" onClick={onSave}>
                保存并关闭
              </Button>
            )}
          </span>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
