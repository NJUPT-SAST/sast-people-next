"use client";

import { Eye } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { ComponentProps } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

import { hiddenScrollbar } from "./emailDashboardConstants";

export function PreviewDialog({
  title,
  html,
  triggerLabel = "模板样张",
  description = "样张使用占位称呼；真实发送时会替换为收件人姓名。",
  triggerClassName,
  triggerSize = "default",
}: {
  title: string;
  html: string | null;
  triggerLabel?: string;
  description?: string;
  triggerClassName?: string;
  triggerSize?: ComponentProps<typeof Button>["size"];
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size={triggerSize}
          disabled={!html}
          className={triggerClassName}
        >
          <Eye data-icon="inline-start" />
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent
        className={cn(
          "max-h-[85dvh] w-[calc(100vw-2rem)] max-w-5xl overflow-y-auto",
          hiddenScrollbar,
        )}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {html && (
          <iframe
            title={title}
            srcDoc={html}
            sandbox=""
            className="h-[70vh] w-full rounded-md border bg-background"
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
