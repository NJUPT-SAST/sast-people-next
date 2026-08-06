"use client";
import { user } from "@/db/schema";
import type { userType } from "@/types/user";
import { zodResolver } from "@hookform/resolvers/zod";
import { createInsertSchema } from "drizzle-zod";
import { useForm } from "react-hook-form";
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
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "../ui/form";
import { Input } from "../ui/input";

export const fullUserSchema = createInsertSchema(user, {
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
export const basicInfoSchema = fullUserSchema.pick({
  name: true,
  studentId: true,
  phone: true,
  email: true,
  college: true,
  major: true,
  qq: true,
});
export const BasicInfo = ({ initialInfo }: { initialInfo: userType }) => {
  const linkProfileUrl =
    process.env.NEXT_PUBLIC_LINK_PROFILE_URL || "https://link.sast.fun";
  const basicInfoForm = useForm<z.infer<typeof basicInfoSchema>>({
    resolver: zodResolver(basicInfoSchema),
    defaultValues: {
      ...Object.fromEntries(
        Object.entries(initialInfo).map(([key, value]) => [key, value ?? ""])
      ),
    },
  });
  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>基本信息</CardTitle>
        <CardDescription>
          个人基本信息来自 SAST Link
          {initialInfo.nickname ? ` · ${initialInfo.nickname}` : ""}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex-1">
        <Form {...basicInfoForm}>
          <div className="flex flex-col gap-4">
            <FormField
              control={basicInfoForm.control}
              name="name"
              disabled
              render={({ field }) => (
                <FormItem>
                  <FormLabel>姓名</FormLabel>
                  <FormControl>
                    <Input placeholder="请填写你的真实姓名" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={basicInfoForm.control}
              name="studentId"
              disabled
              render={({ field }) => (
                <FormItem>
                  <FormLabel>学号</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="请填写你的学号"
                      {...field}
                      value={field.value || ""}
                      disabled
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={basicInfoForm.control}
              name="phone"
              disabled
              render={({ field }) => (
                <FormItem>
                  <FormLabel>手机号码</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="请填写你的手机号"
                      {...field}
                      value={field.value || ""}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={basicInfoForm.control}
              disabled
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>邮箱</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="请填写你的邮箱地址"
                      {...field}
                      value={field.value || ""}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={basicInfoForm.control}
              disabled
              name="qq"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>QQ</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="请填写你的QQ号码"
                      {...field}
                      value={field.value || ""}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={basicInfoForm.control}
              disabled
              name="college"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>学院</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      placeholder="请填写你所在的学院"
                      value={field.value || ""}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={basicInfoForm.control}
              disabled
              name="major"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>专业</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      placeholder="请填写你目前所在的专业"
                      value={field.value || ""}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </Form>
      </CardContent>
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
