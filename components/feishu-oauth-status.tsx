"use client";

import { useEffect, useState, useTransition } from "react";
import { CalendarCheck, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  getCurrentFeishuOAuthStatus,
  redirectFeishuOAuth,
} from "@/action/user/feishuOAuth";

type FeishuOAuthStatusState = {
  bound: boolean;
  accessTokenExpiresAt?: Date | string | null;
};

const statusFormatter = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const formatExpiresAt = (value: Date | string | null | undefined) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return statusFormatter.format(date).replace(/\//g, "-");
};

export function FeishuOAuthStatus({
  role,
  compact = false,
  className,
}: {
  role: number;
  compact?: boolean;
  className?: string;
}) {
  const [status, setStatus] = useState<FeishuOAuthStatusState | null>(null);
  const [failed, setFailed] = useState(false);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (role < 2) return;

    let cancelled = false;
    getCurrentFeishuOAuthStatus()
      .then((nextStatus) => {
        if (cancelled) return;
        setStatus(nextStatus);
        setFailed(false);
      })
      .catch(() => {
        if (cancelled) return;
        setStatus(null);
        setFailed(true);
      });

    return () => {
      cancelled = true;
    };
  }, [role]);

  if (role < 2) return null;

  const expiresAt = formatExpiresAt(status?.accessTokenExpiresAt);
  const isBound = Boolean(status?.bound);
  const description = failed
    ? "状态检查失败"
    : status === null
      ? "正在检查授权"
      : isBound
        ? "已绑定，日程会以当前讲师身份发起"
        : "发起面试日程前需要绑定";

  if (compact) {
    return (
      <div
        className={cn(
          "group-data-[collapsible=icon]:hidden",
          className,
        )}
      >
        <div className="flex items-center gap-2 rounded-md border border-sidebar-border bg-sidebar-accent/35 px-2 py-2 text-sidebar-foreground">
          <div className="rounded-md bg-background/70 p-1 text-muted-foreground">
            <CalendarCheck className="h-3.5 w-3.5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <p className="truncate text-xs font-medium leading-4">
                飞书{isBound ? "已授权" : failed ? "检查失败" : status === null ? "检查中" : "未授权"}
              </p>
              <span
                className={cn(
                  "h-1.5 w-1.5 rounded-full",
                  isBound ? "bg-primary" : failed ? "bg-destructive" : "bg-muted-foreground/50",
                )}
                aria-hidden="true"
              />
            </div>
            {expiresAt && (
              <p className="truncate text-[11px] leading-4 text-muted-foreground">
                有效期 {expiresAt}
              </p>
            )}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="xs"
            className="h-7 shrink-0 px-2 text-[11px]"
            disabled={status === null && !failed}
            loading={isPending}
            onClick={() => {
              startTransition(() => {
                redirectFeishuOAuth();
              });
            }}
          >
            {failed && <RefreshCw className="h-3 w-3" />}
            {isBound ? "重绑" : "绑定"}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col gap-3 rounded-lg border bg-muted/20 p-3 sm:flex-row sm:items-center sm:justify-between", className)}>
      <div className="flex min-w-0 items-start gap-3">
        <div className="mt-0.5 rounded-md border bg-background p-1.5 text-muted-foreground">
          <CalendarCheck className="h-4 w-4" />
        </div>
        <div className="min-w-0 space-y-1">
          <p className="text-sm font-medium">飞书授权</p>
          <p className="text-xs leading-5 text-muted-foreground">
            {description}
          </p>
          {expiresAt && (
            <p className="text-xs text-muted-foreground">
              授权有效期至 {expiresAt}
            </p>
          )}
        </div>
      </div>
      <Button
        type="button"
        variant={isBound ? "outline" : "default"}
        size="sm"
        className="w-full sm:w-auto"
        disabled={status === null && !failed}
        loading={isPending}
        onClick={() => {
          startTransition(() => {
            redirectFeishuOAuth();
          });
        }}
      >
        {failed && <RefreshCw className="h-4 w-4" />}
        {isBound ? "重新绑定" : "绑定飞书"}
      </Button>
    </div>
  );
}
