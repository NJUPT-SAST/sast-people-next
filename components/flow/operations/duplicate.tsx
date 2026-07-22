"use client";

import { duplicateFlow } from "@/action/flow/duplicate";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { displayFlow } from "@/types/flow";
import { Copy } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export function Duplicate({ data }: { data: displayFlow }) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          size="sm"
          variant="ghost"
          className="h-10 shrink-0 rounded-lg px-3 text-sm shadow-none text-foreground hover:bg-muted xl:h-8 xl:px-2"
        >
          <Copy data-icon="inline-start" />
          复制
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>复制流程</DialogTitle>
          <DialogDescription>
            会复制流程信息、步骤名称和笔试题目；报名、评分、面评和邮件记录不会复制。
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2">
          <DialogClose asChild>
            <Button variant="outline">取消</Button>
          </DialogClose>
          <Button
            onClick={() => {
              setOpen(false);
              toast.promise(duplicateFlow(data.id), {
                loading: "正在复制流程",
                success: "流程已复制",
                error: "复制失败",
              });
            }}
          >
            确认复制
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


