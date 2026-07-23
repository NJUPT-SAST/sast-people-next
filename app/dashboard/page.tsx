import { PageHeader, PageTitle } from "@/components/route";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ShowQrCode } from "@/components/userInfo/showQrCode";
import originalDayjs from "@/lib/dayjs";
import { Suspense } from "react";
import { useUserInfo as getUserInfo } from "@/hooks/useUserInfo";
import { BasicInfoServer } from "./basicInfo";
import { ExperienceInfoServer } from "./experienceInfo";
import { LinkLogin } from "@/components/linkLogin";
import { Clock, Rocket } from "lucide-react";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{
    start: string;
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
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Suspense
            fallback={
              <Card>
                <CardHeader>
                  <CardTitle>基本信息</CardTitle>
                  <CardDescription>个人基本信息</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
                  <Skeleton className="w-[100px] h-[20px]" />
                  <Skeleton className="w-full h-[20px]" />
                  <Skeleton className="w-full h-[20px]" />
                </CardContent>
              </Card>
            }
          >
            <BasicInfoServer />
          </Suspense>
          <Suspense
            fallback={
              <Card>
                <CardHeader>
                  <CardTitle>我的能力</CardTitle>
                  <CardDescription>
                    请与我们分享你目前的兴趣与能力，以便找到最合适的部门
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
                  <Skeleton className="w-[100px] h-[20px]" />
                  <Skeleton className="w-full h-[20px]" />
                  <Skeleton className="w-full h-[20px]" />
                </CardContent>
              </Card>
            }
          >
            <ExperienceInfoServer />
          </Suspense>
        </div>
      )}
    </>
  );
}

