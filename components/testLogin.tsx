"use client";

import { loginWithMockLinkUser } from "@/action/test-login";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { ArrowRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";

export type MockLoginAccount = {
  studentId: string;
  name: string;
  roleLabel: string;
  departmentLabel: string;
};

export const TestLogin = ({ accounts = [] }: { accounts?: MockLoginAccount[] }) => {
  const router = useRouter();
  const [studentId, setStudentId] = useState("");

  return (
    <div className="flex w-full flex-col gap-4">
      <Separator className="w-full bg-[#dbe5da]" />
      <div className="space-y-1">
        <p className="text-sm font-medium text-[#18231d]">使用测试帐号登入</p>
        <p className="text-xs text-[#66756c]">仅本地 Link mock 环境可见。</p>
      </div>
      <form
        action={async (formData) => {
          await toast.promise(
            async () => {
              await loginWithMockLinkUser(formData);
              router.push("/dashboard");
            },
            {
              loading: "登录中",
              success: "登录成功",
              error: "登录失败，请检查测试学号。",
            },
          ).unwrap();
        }}
        className="flex w-full flex-col gap-3 sm:flex-row"
      >
        <Input
          disabled={useFormStatus().pending}
          type="text"
          name="studentId"
          value={studentId}
          onChange={(event) => setStudentId(event.target.value)}
          placeholder="请填写测试学号"
          className="h-11 border-[#dbe5da] bg-white text-[#18231d] placeholder:text-[#8a968e] focus-visible:ring-[#18A058]/30"
        />
        <FormContentWithStatus />
      </form>
      {accounts.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-[#66756c]">
            可用测试账号（点击填入学号）
          </p>
          <div className="flex max-h-44 flex-wrap gap-1.5 overflow-y-auto pr-1">
            {accounts.map((account) => (
              <button
                key={account.studentId}
                type="button"
                onClick={() => setStudentId(account.studentId)}
                className={`rounded-full border px-2.5 py-1 text-left text-[11px] leading-4 transition-colors ${
                  studentId === account.studentId
                    ? "border-[#18A058] bg-[#18A058]/10 text-[#18231d]"
                    : "border-[#dbe5da] bg-white text-[#66756c] hover:border-[#18A058]/50 hover:text-[#18231d]"
                }`}
              >
                <span className="font-medium">{account.studentId}</span>
                {" · "}
                {account.name}
                {" · "}
                {account.roleLabel}
                {account.departmentLabel ? ` · ${account.departmentLabel}` : ""}
              </button>
            ))}
          </div>
        </div>
      )}
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
