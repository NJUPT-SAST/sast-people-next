"use client";

import { loginWithMockLinkUser } from "@/action/test-login";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { ArrowRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";

export const TestLogin = () => {
  const router = useRouter();

  return (
    <div className="flex w-full flex-col gap-4">
      <Separator className="w-full bg-[#dbe5da]" />
      <div className="space-y-1">
        <p className="text-sm font-medium text-[#18231d]">使用测试帐号登入</p>
        <p className="text-xs text-[#66756c]">仅本地 Link mock 环境可见。</p>
      </div>
      <form
        action={async (formData) => {
          toast.promise(
            async () => {
              await loginWithMockLinkUser(formData);
              router.push("/dashboard");
            },
            {
              loading: "登录中",
              success: "登录成功",
              error: "登录失败，请检查测试学号。",
            },
          );
        }}
        className="flex w-full flex-col gap-3 sm:flex-row"
      >
        <Input
          disabled={useFormStatus().pending}
          type="text"
          name="studentId"
          placeholder="请填写测试学号"
          className="h-11 border-[#dbe5da] bg-white text-[#18231d] placeholder:text-[#8a968e] focus-visible:ring-[#18A058]/30"
        />
        <FormContentWithStatus />
      </form>
    </div>
  );
};

const FormContentWithStatus = () => {
  const formStatus = useFormStatus();
  return (
    <Button
      loading={formStatus.pending}
      disabled={formStatus.pending}
      type="submit"
      className="m-0 h-11 shrink-0"
    >
      登录 <ArrowRight />
    </Button>
  );
};
