"use client";

import * as Sentry from "@sentry/nextjs";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Home, RotateCcw, ShieldQuestion } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();

  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <div className="w-full h-screen flex justify-center items-center flex-col gap-3 p-4">
      <ShieldQuestion className="w-[80px] h-[80px]" strokeWidth="1px" />
      <h2 className="text-lg font-semibold text-center">
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
        <Button variant="outline" onClick={() => router.back()}>
          <ArrowLeft />
          回到上一页
        </Button>
        <Button asChild variant="outline">
          <Link href="/dashboard">
            <Home />
            回到控制台
          </Link>
        </Button>
        <Button onClick={() => reset()}>
          <RotateCcw />
          重试加载
        </Button>
      </div>
    </div>
  );
}
