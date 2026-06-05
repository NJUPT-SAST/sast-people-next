"use client";

import { useEffect, useState, useTransition } from "react";
import { CalendarCheck, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
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

export function FeishuOAuthStatus({ role }: { role: number }) {
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

  return (
    <div className="flex flex-col gap-3 rounded-lg border bg-muted/20 p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        <div className="mt-0.5 rounded-md border bg-background p-1.5 text-muted-foreground">
          <CalendarCheck className="h-4 w-4" />
        </div>
        <div className="min-w-0 space-y-1">
          <p className="text-sm font-medium">飞书授权</p>
          <p className="text-xs leading-5 text-muted-foreground">
            {failed
              ? "暂时无法检查飞书授权状态，发起面试日程前请确认授权可用。"
              : status === null
                ? "正在检查当前账号的飞书授权状态。"
                : isBound
                  ? "已绑定飞书，面试会议、日程和提醒会以当前讲师身份发起。"
                  : "未绑定飞书，讲师发起面试日程前需要先完成授权。"}
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
