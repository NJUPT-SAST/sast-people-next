"use client";

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";

export function FeishuOAuthFailureToast({
  message,
}: {
  message?: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (!message) return;

    toast.error(message);
    const nextSearchParams = new URLSearchParams(searchParams);
    nextSearchParams.delete("feishuOAuth");
    const query = nextSearchParams.toString();
    router.replace(query ? `${pathname}?${query}` : pathname);
  }, [message, pathname, router, searchParams]);

  return null;
}
