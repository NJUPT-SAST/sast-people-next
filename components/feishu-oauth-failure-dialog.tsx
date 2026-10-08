"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, ExternalLink } from "lucide-react";
import { redirectFeishuOAuth } from "@/action/user/feishuOAuth";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/** Link 个人设置页的飞书绑定入口（与 Link 的 `NEXT_PUBLIC_LINK_PROFILE_URL` 同源） */
const linkFeishuBindingUrl = () => {
  const baseUrl = (
    process.env.NEXT_PUBLIC_LINK_PROFILE_URL || "https://link.sast.fun"
  ).replace(/\/+$/, "");
  return `${baseUrl}/settings`;
};

/** 「重新绑定飞书」对这些失败原因才有意义；其余（账号冲突等）只能先处理完再重试 */
const RETRYABLE_FAILURES = ["identity_mismatch", "authorization_failed"];

/**
 * 飞书 OAuth 绑定失败的居中弹窗。
 *
 * 以前这里是一个右下角 toast，会被飞书授权页盖住——尤其手机上用户既看不到失败原因，
 * 也不知道要去 Link 先绑定飞书。现在失败原因固定在屏幕中央，并直接给出出路：
 * Link 账号没有飞书身份时提供「去 Link 绑定飞书」（Link `/settings`），
 * 账号不匹配/授权中断时提供「重新绑定飞书」。
 */
export function FeishuOAuthFailureDialog({
  failure,
  message,
}: {
  failure?: string;
  message?: string;
}) {
  /* 清理查询参数会触发页面重渲染、message 变回 undefined：
     失败提示在首次挂载时定下来，弹窗不跟着参数一起消失 */
  const [failureInfo] = useState(() => (message ? { failure, message } : null));
  const [open, setOpen] = useState(Boolean(message));
  const [isPending, startTransition] = useTransition();
  const urlCleaned = useRef(false);
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (!failureInfo || urlCleaned.current) return;
    urlCleaned.current = true;
    const nextSearchParams = new URLSearchParams(searchParams);
    nextSearchParams.delete("feishuOAuth");
    const query = nextSearchParams.toString();
    router.replace(query ? `${pathname}?${query}` : pathname);
  }, [failureInfo, pathname, router, searchParams]);

  if (!failureInfo) return null;

  const needsLinkBinding = failureInfo.failure === "link_identity_missing";
  const canRetry =
    needsLinkBinding || RETRYABLE_FAILURES.includes(failureInfo.failure ?? "");
  const startOAuth = () => {
    startTransition(() => {
      const query = searchParams.toString();
      redirectFeishuOAuth(`${pathname}${query ? `?${query}` : ""}`);
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle
              className="size-4 shrink-0 text-destructive"
              aria-hidden="true"
            />
            飞书绑定未完成
          </DialogTitle>
          <DialogDescription className="text-sm leading-6">
            {failureInfo.message}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            关闭
          </Button>
          {canRetry && (
            <Button
              type="button"
              variant={needsLinkBinding ? "outline" : "default"}
              disabled={isPending}
              onClick={startOAuth}
            >
              重新绑定飞书
            </Button>
          )}
          {needsLinkBinding && (
            <Button asChild>
              <a href={linkFeishuBindingUrl()} target="_blank" rel="noreferrer">
                去 Link 绑定飞书
                <ExternalLink className="size-4" aria-hidden="true" />
              </a>
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
