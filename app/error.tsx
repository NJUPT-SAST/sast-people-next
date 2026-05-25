"use client";

import { Button } from "@/components/ui/button";
import { ArrowLeft, ShieldQuestion } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

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

  return (
    <div className="w-full h-screen flex justify-center items-center flex-col gap-3 p-4">
      <ShieldQuestion className="w-[80px] h-[80px]" strokeWidth="1px" />
      <h2 className="text-lg font-semibold text-center">
        看起来遇到了一些问题，联系管理员获取更多帮助
      </h2>
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
