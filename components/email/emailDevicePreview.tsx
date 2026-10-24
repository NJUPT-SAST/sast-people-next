"use client";

import { Monitor, Smartphone } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * 成品预览：同一份服务端渲染的 HTML，按桌面 / 手机两种宽度各看一遍。
 *
 * 邮件在手机上「卡片撑满、按钮换行」和桌面差别很大，只看桌面宽度不算看过。
 */
export function EmailDevicePreview({ title, html }: { title: string; html: string }) {
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-center gap-1">
        <Button
          type="button"
          size="sm"
          variant={device === "desktop" ? "default" : "outline"}
          aria-pressed={device === "desktop"}
          onClick={() => setDevice("desktop")}
        >
          <Monitor data-icon="inline-start" />
          桌面
        </Button>
        <Button
          type="button"
          size="sm"
          variant={device === "mobile" ? "default" : "outline"}
          aria-pressed={device === "mobile"}
          onClick={() => setDevice("mobile")}
        >
          <Smartphone data-icon="inline-start" />
          手机
        </Button>
        <span className="ml-2 text-[11px] text-muted-foreground">
          {device === "mobile"
            ? "按 390px 宽渲染：卡片与按钮在手机上的换行看这里"
            : "按桌面宽度渲染"}
        </span>
      </div>
      <iframe
        title={`${title}成品预览`}
        srcDoc={html}
        sandbox=""
        className={cn(
          "mx-auto h-[70vh] rounded-md border bg-white",
          device === "mobile" ? "w-[390px] max-w-full" : "w-full max-w-3xl",
        )}
      />
    </div>
  );
}
