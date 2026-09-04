"use client";
import type { userType } from "@/types/user";
import { z } from "zod/v4";
import { Button } from "../ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "../ui/card";

export const basicInfoSchema = z.object({
  name: z
    .string()
    .min(2, "姓名至少两个字符")
    .regex(/^[\u4e00-\u9fff]+$/, "姓名只能包含中文")
    .trim(),
  studentId: z.string().min(1, "学号不能为空").trim().toUpperCase(),
  email: z
    .string()
    .min(1, "邮箱不能为空")
    .email("请输入正确的邮箱地址")
    .trim()
    .toLowerCase(),
  phone: z
    .string()
    .min(1, "手机号码不能为空")
    .regex(
      /^(13[0-9]|14[01456879]|15[0-35-9]|16[2567]|17[0-8]|18[0-9]|19[0-35-9])\d{8}$/,
      "请输入正确的手机号码"
    ),
  college: z.string().min(1, "学院不能为空").trim(),
  major: z.string().min(1, "专业不能为空").trim(),
  qq: z.string().min(1, "QQ号不能为空").trim(),
});
export const BasicInfo = ({
  initialInfo,
  embedded = false,
}: {
  initialInfo: userType;
  embedded?: boolean;
}) => {
  const linkProfileUrl =
    process.env.NEXT_PUBLIC_LINK_PROFILE_URL || "https://link.sast.fun";
  const fields = [
    ["姓名", initialInfo.name],
    ["学号", initialInfo.studentId],
    ["手机号码", initialInfo.phone],
    ["邮箱", initialInfo.email],
    ["QQ", initialInfo.qq],
    ["学院", initialInfo.college],
    ["专业", initialInfo.major],
  ] as const;
  const header = (
    <div className="space-y-1">
      <h2 className="text-lg font-semibold tracking-tight">基本信息</h2>
      <p className="text-sm text-muted-foreground">
        个人基本信息来自 SAST Link
        {initialInfo.nickname ? ` · ${initialInfo.nickname}` : ""}
      </p>
    </div>
  );
  const content = (
    <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
      {fields.map(([label, value]) => (
        <div key={label} className="min-w-0 space-y-1">
          <dt className="text-sm text-muted-foreground">{label}</dt>
          <dd className="break-words text-sm font-medium text-foreground">
            {value || "未填写"}
          </dd>
        </div>
      ))}
    </dl>
  );

  if (embedded) {
    return (
      <section className="min-w-0 space-y-6 p-6 sm:p-8">
        {header}
        {content}
      </section>
    );
  }

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>基本信息</CardTitle>
        <CardDescription>
          个人基本信息来自 SAST Link
          {initialInfo.nickname ? ` · ${initialInfo.nickname}` : ""}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex-1">{content}</CardContent>
      <CardFooter className="mt-auto justify-end border-t pt-4">
        <Button asChild>
          <a href={linkProfileUrl} target="_blank" rel="noreferrer">
            前往 Link 修改
          </a>
        </Button>
      </CardFooter>
    </Card>
  );
};
