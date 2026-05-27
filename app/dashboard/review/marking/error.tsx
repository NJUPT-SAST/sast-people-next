"use client";

import * as Sentry from "@sentry/nextjs";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ShieldQuestion } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function Error({
  error,
  reset: _reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <div className="w-full h-full flex justify-center items-center flex-col gap-3">
      <ShieldQuestion className="w-[100px] h-[100px]" strokeWidth="1px" />
      <Button onClick={() => router.back()}>
        <ArrowLeft />
        回到上一页
      </Button>
    </div>
  );
}
