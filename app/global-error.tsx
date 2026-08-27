"use client";

import * as Sentry from "@sentry/nextjs";
import { Button } from "@/components/ui/button";
import { Home, LogIn, ShieldQuestion } from "lucide-react";
import { useEffect } from "react";

export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="zh-cn">
      <body>
        <div className="flex min-h-dvh w-full flex-col items-center justify-center gap-3 p-4">
          <ShieldQuestion className="h-20 w-20" strokeWidth="1px" />
          <h2 className="text-center text-lg font-semibold">
            看起来遇到了一些问题，联系管理员获取更多帮助
          </h2>
          {error.digest && (
            <p className="font-mono text-xs text-muted-foreground">
              错误编号：{error.digest}
            </p>
          )}
          {process.env.NODE_ENV !== "production" && error.message && (
            <p className="max-w-xl break-words rounded-md border bg-muted/30 px-3 py-2 text-center text-xs text-muted-foreground">
              {error.message}
            </p>
          )}
          <div className="flex flex-wrap justify-center gap-2">
            <Button asChild variant="outline">
              <a href="/dashboard">
                <Home />
                回到控制台
              </a>
            </Button>
            <Button asChild variant="outline">
              <a href="/login">
                <LogIn />
                重新登录
              </a>
            </Button>
          </div>
        </div>
      </body>
    </html>
  );
}
