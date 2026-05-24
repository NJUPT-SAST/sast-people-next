"use client";

import { Button } from "@/components/ui/button";
import { ArrowLeft, ShieldQuestion } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo } from "react";

export default function GlobalError({
  error,
  reset: _reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();

  useEffect(() => {
    console.error(error);
  }, [error]);

  const info = useMemo(() => {
    try {
      const parts = [
        `name: ${error?.name || "unknown"}`,
        `message: ${error?.message || "unknown"}`,
        `digest: ${error?.digest || "none"}`,
        `stack: ${error?.stack?.split("\n")[0] || "none"}`,
      ];
      return parts.join("\n");
    } catch {
      return String(error);
    }
  }, [error]);

  return (
    <div className="w-full h-screen flex justify-center items-center flex-col gap-3 p-4">
      <ShieldQuestion className="w-[80px] h-[80px]" strokeWidth="1px" />
      <h2 className="text-lg font-semibold text-center">
        看起来遇到了一些问题，联系管理员获取更多帮助
      </h2>
      {info && (
        <pre className="text-[10px] text-muted-foreground bg-muted px-3 py-2 rounded font-mono whitespace-pre-wrap max-w-md w-full max-h-48 overflow-auto">
          {info}
        </pre>
      )}
      <div className="flex gap-2">
        <Button variant="outline" onClick={() => router.back()}>
          <ArrowLeft />
          回到上一页
        </Button>
        <Button onClick={() => router.refresh()}>刷新页面</Button>
      </div>
    </div>
  );
}
