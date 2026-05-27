"use client";
import { MarkProblemTable } from "@/components/review/markProblemTable";
import { useUserPointList as getUserPointList } from "@/hooks/useUserPointList";
import { useLocalFlowId } from "@/hooks/useLocalFlowId";
import { useState, useEffect } from "react";
import { userPoint } from "@/db/schema";
import { InferSelectModel } from "drizzle-orm";
import { useUserFlowId } from "@/hooks/useUserFlow";
import { Loading } from "@/components/loading";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";

export const MarkProblemTableServer = ({ user }: { user: string }) => {
  const router = useRouter();
  const flowId = useLocalFlowId();
  const {
    data: userFlowData,
    error: userFlowError,
    isLoading: userFlowLoading,
  } = useUserFlowId(user, flowId ?? 0);
  const [points, setPoints] = useState<
    Array<InferSelectModel<typeof userPoint>>
  >([]);
  const [loading, setLoading] = useState(false);
  const [pointsError, setPointsError] = useState<string | null>(null);

  const userFlowId = userFlowData?.userFlowId ?? 0;

  useEffect(() => {
    const fetchPoints = async () => {
      if (!userFlowId || userFlowId <= 0) {
        setPoints([]);
        setLoading(false);
        return;
      }

      setLoading(true);
      setPointsError(null);
      try {
        const data = await getUserPointList(userFlowId);
        setPoints(data);
      } catch (error) {
        setPoints([]);
        setPointsError(
          error instanceof Error ? error.message : '加载评分记录失败',
        );
      } finally {
        setLoading(false);
      }
    };

    void fetchPoints();
  }, [userFlowId]);

  if (flowId === null) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>未设置阅卷范围</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          请先返回上一页设置阅卷范围，再开始阅卷。
        </CardContent>
      </Card>
    );
  }

  if (userFlowLoading || loading) {
    return <Loading />;
  }

  if (userFlowError) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>未找到报名记录</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm text-muted-foreground">
          <p>
            当前阅卷范围下没有找到学号为 {user} 的报名记录，请确认该同学已报名当前流程。
          </p>
          <Button className="w-fit" onClick={() => router.push('/dashboard/review')}>
            返回重新扫码
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (pointsError) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>加载评分记录失败</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm text-muted-foreground">
          <p>
            无法读取该考生的历史评分记录，请确认数据库迁移已完成后再试。
          </p>
          <p className="rounded-md bg-muted px-3 py-2 font-mono text-xs">
            {pointsError}
          </p>
          <Button className="w-fit" onClick={() => router.push('/dashboard/review')}>
            返回重新扫码
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!userFlowId) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>未找到考生记录</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          当前阅卷范围下没有找到学号为 {user} 的报名记录，请确认阅卷范围和学号是否正确。
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <MarkProblemTable points={points} userFlowId={userFlowId} />
    </>
  );
};
