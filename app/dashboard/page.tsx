import { FeishuOAuthFailureToast } from "@/components/feishu-oauth-failure-toast";
import { PageHeader, PageTitle } from "@/components/route";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ShowQrCode } from "@/components/userInfo/showQrCode";
import originalDayjs from "@/lib/dayjs";
import { Suspense } from "react";
import { useUserInfo as getUserInfo } from "@/hooks/useUserInfo";
import { BasicInfoServer } from "./basicInfo";
import { ExperienceInfoServer } from "./experienceInfo";
import { LinkLogin } from "@/components/linkLogin";
import { Clock, Rocket } from "lucide-react";

export const feishuOAuthFailureMessage: Record<string, string> = {
  link_identity_missing: "绑定失败：当前 Link 账号尚未绑定飞书身份，请先在 Link 完成飞书绑定后重试。",
  identity_mismatch: "绑定失败：请使用与当前 Link 账号绑定的同一个飞书账号授权。",
  link_session_invalid: "绑定失败：Link 登录状态已失效，请重新登录 People 后再绑定飞书。",
  account_conflict: "绑定失败：该飞书账号已绑定到另一位 People 用户，请联系管理员处理。",
  authorization_failed: "飞书授权未完成，请重新发起绑定；若仍失败请联系管理员。",
};

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{
    start?: string;
    feishuOAuth?: string;
  }>;
}) {
  const userInfo = await getUserInfo();
  const awaitedSearchParams = await searchParams;
  const linkProfileUrl =
    process.env.NEXT_PUBLIC_LINK_PROFILE_URL || "https://link.sast.fun";
  return (
    <>
      <PageHeader className="items-start border-b pb-4 sm:items-start">
        <div className="min-w-0 space-y-1">
          <PageTitle />
          {userInfo.updatedAt && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Clock className="h-3 w-3" />
              上次更新：
              {originalDayjs(userInfo.updatedAt).format("YYYY-MM-DD HH:mm")}
            </div>
          )}
        </div>
        {userInfo.phone && (
          <div className="flex w-full items-center sm:w-auto">
            <ShowQrCode uid={userInfo.id.toString()} />
          </div>
        )}
      </PageHeader>
      <FeishuOAuthFailureToast
        message={feishuOAuthFailureMessage[awaitedSearchParams.feishuOAuth ?? ""]}
      />
      {userInfo.studentId === null && !awaitedSearchParams.start ? (
        userInfo.role === 0 ? (
          <div className="flex flex-1 items-center justify-center rounded-xl bg-muted/30 p-8 animate-in fade-in duration-500">
            <div className="flex flex-col items-center gap-3 text-center max-w-sm">
              <Rocket className="h-12 w-12 text-muted-foreground/50" />
              <h3 className="text-2xl font-bold tracking-tight">
                Welcome to SAST People
              </h3>
              <p className="text-sm text-muted-foreground">
                看起来是新同学呢，在报名之前介绍一下你自己吧！
              </p>
              <Button className="mt-2" asChild>
                <a href={linkProfileUrl} target="_blank" rel="noreferrer">
                  前往 Link 完善资料
                </a>
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-1 items-center justify-center rounded-xl bg-muted/30 p-8 animate-in fade-in duration-500">
            <div className="flex flex-col items-center gap-3 text-center max-w-sm">
              <Rocket className="h-12 w-12 text-muted-foreground/50" />
              <h3 className="text-2xl font-bold tracking-tight">
                Welcome to SAST People
              </h3>
              <p className="text-sm text-muted-foreground">
                如果需要编辑资料，请在此处绑定 SAST Link 账号。
              </p>
              <LinkLogin isBinding={true} />
            </div>
          </div>
        )
      ) : (
        <Card className="gap-0 overflow-hidden p-0">
          <Suspense
            fallback={
              <div className="space-y-6 p-6 sm:p-8">
                <div className="space-y-1">
                  <p className="text-lg font-semibold">基本信息</p>
                  <p className="text-sm text-muted-foreground">个人基本信息</p>
                </div>
                <div className="flex flex-col gap-3">
                  <Skeleton className="w-[100px] h-[20px]" />
                  <Skeleton className="w-full h-[20px]" />
                  <Skeleton className="w-full h-[20px]" />
                </div>
              </div>
            }
          >
            <BasicInfoServer embedded />
          </Suspense>
          <Suspense
            fallback={
              <div className="space-y-6 border-t p-6 sm:p-8">
                <div className="space-y-1">
                  <p className="text-lg font-semibold">我的能力</p>
                  <p className="text-sm text-muted-foreground">能力信息来自 SAST Link</p>
                </div>
                <div className="flex flex-col gap-3">
                  <Skeleton className="w-[100px] h-[20px]" />
                  <Skeleton className="w-full h-[20px]" />
                  <Skeleton className="w-full h-[20px]" />
                </div>
              </div>
            }
          >
            <ExperienceInfoServer embedded />
          </Suspense>
          <div className="flex justify-end border-t bg-muted/10 px-6 py-4 sm:px-8">
            <Button asChild>
              <a href={linkProfileUrl} target="_blank" rel="noreferrer">
                前往 Link 修改
              </a>
            </Button>
          </div>
        </Card>
      )}
    </>
  );
}
