"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";

export function FeishuOAuthFailureToast({
  message,
}: {
  message?: string;
}) {
  const handledMessage = useRef<string | undefined>(undefined);
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (!message || handledMessage.current === message) return;

    handledMessage.current = message;
    toast.error(message);
    const nextSearchParams = new URLSearchParams(searchParams);
    nextSearchParams.delete("feishuOAuth");
    const query = nextSearchParams.toString();
    router.replace(query ? `${pathname}?${query}` : pathname);
  }, [message, pathname, router, searchParams]);

  return null;
}
