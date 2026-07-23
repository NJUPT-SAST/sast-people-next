"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Image from "next/image";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  getCurrentFeishuOAuthStatus,
  redirectFeishuOAuth,
} from "@/action/user/feishuOAuth";

type FeishuOAuthStatusState = {
  bound: boolean;
  authorizationExpiresAt?: Date | string | null;
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

const formatExpiresAtShort = (value: Date | string | null | undefined) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("month")}-${get("day")} ${get("hour")}:${get("minute")}`;
};

function FeishuLogo({ className }: { className?: string }) {
  return (
    <Image
      src="/images/feishu-logo.png"
      alt=""
      width={36}
      height={36}
      className={cn("object-contain", className)}
    />
  );
}

export function FeishuOAuthStatus({
  role,
  compact = false,
  className,
  onStatusChange,
}: {
  role: number;
  compact?: boolean;
  className?: string;
  onStatusChange?: (
    status: FeishuOAuthStatusState | null,
    meta: { failed: boolean },
  ) => void;
}) {
  const [status, setStatus] = useState<FeishuOAuthStatusState | null>(null);
  const [failed, setFailed] = useState(false);
  const [isPending, startTransition] = useTransition();
  const onStatusChangeRef = useRef(onStatusChange);

  useEffect(() => {
    onStatusChangeRef.current = onStatusChange;
  }, [onStatusChange]);

  useEffect(() => {
    if (role < 2) {
      onStatusChangeRef.current?.(null, { failed: false });
      return;
    }

    let cancelled = false;
    getCurrentFeishuOAuthStatus()
      .then((nextStatus) => {
        if (cancelled) return;
        setStatus(nextStatus);
        setFailed(false);
        onStatusChangeRef.current?.(nextStatus, { failed: false });
      })
      .catch(() => {
        if (cancelled) return;
        setStatus(null);
        setFailed(true);
        onStatusChangeRef.current?.(null, { failed: true });
      });

    return () => {
      cancelled = true;
    };
  }, [role]);

  if (role < 2) return null;

  const expiresAt = formatExpiresAt(status?.authorizationExpiresAt);
  const expiresAtShort = formatExpiresAtShort(status?.authorizationExpiresAt);
  const isBound = Boolean(status?.bound);
  const isLoading = status === null && !failed;
  const title = failed
    ? "飞书检查失败"
    : isLoading
      ? "飞书检查中"
      : isBound
        ? "飞书已授权"
        : "飞书未授权";
  const description = failed
    ? "状态检查失败，可重试绑定"
    : isLoading
      ? "正在检查授权状态"
      : isBound
        ? "日程会以当前身份发起"
        : "发起面试日程前需要绑定";
  const actionLabel = failed ? "重试" : isBound ? "重绑" : "绑定";
  const fullActionLabel = failed ? "重新检查" : isBound ? "重新绑定" : "绑定飞书";

  const startOAuth = () => {
    startTransition(() => {
      redirectFeishuOAuth();
    });
  };

  if (compact) {
    return (
      <div className={cn("group-data-[collapsible=icon]:hidden", className)}>
        <div className="flex items-center gap-2 rounded-lg border border-sidebar-border/70 px-2 py-1.5">
          <FeishuLogo
            className={cn("size-5 shrink-0 rounded-md", isLoading && "opacity-60")}
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs text-sidebar-foreground">
              {title}
              {expiresAtShort ? (
                <span className="text-muted-foreground"> · {expiresAtShort}</span>
              ) : null}
            </p>
          </div>
          <button
            type="button"
            className="shrink-0 text-[11px] text-muted-foreground transition-colors hover:text-sidebar-foreground disabled:opacity-50"
            disabled={isLoading || isPending}
            onClick={startOAuth}
          >
            {isPending ? "…" : actionLabel}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-lg border border-border/80 px-3 py-3 sm:flex-row sm:items-center sm:justify-between",
        className,
      )}
    >
      <div className="flex min-w-0 items-center gap-2.5">
        <FeishuLogo
          className={cn("size-7 shrink-0 rounded-md", isLoading && "opacity-60")}
        />
        <div className="min-w-0">
          <p className="text-sm text-foreground">{title}</p>
          <p className="text-xs text-muted-foreground">
            {expiresAt ? `有效期至 ${expiresAt}` : description}
          </p>
        </div>
      </div>
      <Button
        type="button"
        variant={isBound ? "ghost" : "default"}
        size="sm"
        className="w-full sm:w-auto"
        disabled={isLoading}
        loading={isPending}
        onClick={startOAuth}
      >
        {failed && !isPending && <RefreshCw className="size-4" />}
        {fullActionLabel}
      </Button>
    </div>
  );
}