"use client";

import * as Sentry from "@sentry/nextjs";
import { AlertCircle, RotateCcw } from "lucide-react";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function InterviewsError({
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
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <AlertCircle className="size-6" aria-hidden="true" />
      </div>
      <p className="text-sm font-medium">面试管理加载失败</p>
      <p className="max-w-md text-xs leading-5 text-muted-foreground">
        请重新加载；如果持续失败，可到「关于与反馈」提交问题。
      </p>
      <Button onClick={reset}>
        <RotateCcw />
        重新加载
      </Button>
    </div>
  );
}
