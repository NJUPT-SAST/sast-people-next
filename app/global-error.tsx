"use client";

import * as Sentry from "@sentry/nextjs";
import { Button } from "@/components/ui/button";
import { ShieldQuestion } from "lucide-react";
import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
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
          <Button onClick={() => reset()}>刷新页面</Button>
        </div>
      </body>
    </html>
  );
}
