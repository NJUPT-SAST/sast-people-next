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

export const MarkProblemTableServer = ({ user }: { user: string }) => {
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

  const userFlowId = userFlowData?.userFlowId ?? 0;

  useEffect(() => {
    const fetchPoints = async () => {
      if (!userFlowId || userFlowId <= 0) {
        setPoints([]);
        setLoading(false);
        return;
      }

      setLoading(true);
      const data = await getUserPointList(userFlowId);
      setPoints(data);
      setLoading(false);
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
          <CardTitle>加载阅卷信息失败</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          无法读取当前考生的阅卷记录，请稍后重试。
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
