'use client';

import { InferSelectModel } from 'drizzle-orm';
import { ArrowLeft, CheckCircle2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';

import { useLocalProblemList } from '@/hooks/useLocalProblemList';
import { userPoint } from '@/db/schema';

import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Input } from '../ui/input';
import { Label } from '../ui/label';

export const MarkProblemTable = ({
  points,
  userFlowId,
}: {
  points: Array<InferSelectModel<typeof userPoint>>;
  userFlowId: number;
}) => {
  const router = useRouter();
  const studentId = useSearchParams().get('user');

  const [editedScores, setEditedScores] = useState<Record<number, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const problems = useLocalProblemList();

  const getDisplayScore = (problemId: number, fallback: number) =>
    editedScores[problemId] ?? String(fallback);

  const parseScore = (value: string) => {
    const trimmedValue = value.trim();

    if (!trimmedValue) {
      return Number.NaN;
    }

    return Number(trimmedValue);
  };

  const validateScore = (
    problemName: string,
    maxPoint: number,
    score: number,
  ) => {
    if (!Number.isFinite(score)) {
      return `${problemName} 的得分不能为空`;
    }

    if (!Number.isInteger(score)) {
      return `${problemName} 的得分必须是整数`;
    }

    if (score < 0 || score > maxPoint) {
      return `${problemName} 的得分必须在 0 到 ${maxPoint} 之间`;
    }

    return null;
  };

  const problemPoints: Array<InferSelectModel<typeof userPoint>> = problems.map(
    (problem) => {
      const existed = points.find((point) => point.fkProblemId === problem.id);
      const currentScore = parseScore(
        getDisplayScore(problem.id, existed?.points ?? 0),
      );

      return {
        id: existed?.id ?? 0,
        fkUserFlowId: userFlowId,
        fkProblemId: problem.id,
        points: Number.isFinite(currentScore) ? currentScore : 0,
      };
    },
  );

  const hasUnsavedChanges = problems.some((problem) => {
    const existed = points.find((point) => point.fkProblemId === problem.id);
    const originalScore = String(existed?.points ?? 0);
    return getDisplayScore(problem.id, existed?.points ?? 0) !== originalScore;
  });

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!hasUnsavedChanges) {
        return;
      }

      event.preventDefault();
      event.returnValue = '';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [hasUnsavedChanges]);

  if (problems.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>未设置阅卷范围</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            请返回上一页设置阅卷范围后再开始阅卷。
          </p>
        </CardContent>
      </Card>
    );
  }

  const batchUpsertPoint = async (
    values: Array<InferSelectModel<typeof userPoint>>,
  ) => {
    const response = await fetch('/api/user-point', {
      method: 'POST',
      body: JSON.stringify({
        action: 'batch',
        data: values,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || '批量更新失败');
    }

    return response.json();
  };

  const buildValidatedPayload = () => {
    const values = problemPoints.map((problemPoint, index) => {
      const score = parseScore(
        getDisplayScore(problems[index].id, problemPoint.points),
      );
      const errorMessage = validateScore(
        problems[index].name,
        problems[index].maxPoint,
        score,
      );

      if (errorMessage) {
        toast.error(errorMessage);
        return null;
      }

      return {
        ...problemPoint,
        points: score,
      };
    });

    if (values.some((value) => value === null)) {
      return null;
    }

    return values as Array<InferSelectModel<typeof userPoint>>;
  };

  const handleBackToReview = () => {
    if (hasUnsavedChanges) {
      const confirmed = window.confirm('当前评分尚未保存，确定直接返回扫码页吗？');

      if (!confirmed) {
        return;
      }
    }

    router.push('/dashboard/review');
  };

  const handleSubmit = async () => {
    const values = buildValidatedPayload();

    if (!values) {
      return;
    }

    setIsSubmitting(true);

    try {
      const request = batchUpsertPoint(values);
      toast.promise(request, {
        loading: '正在提交评分...',
        success: '评分已保存，正在返回扫码页',
        error: '评分保存失败',
      });
      await request;
      router.push('/dashboard/review');
    } catch {
      return;
    } finally {
      setIsSubmitting(false);
    }
  };

  const totalScore = problemPoints.reduce((sum, item) => sum + item.points, 0);
  const totalMaxScore = problems.reduce((sum, item) => sum + item.maxPoint, 0);

  return (
    <div className="flex flex-col gap-4">
      <Card key={userFlowId}>
        <CardHeader>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
              <div className="flex flex-col gap-2">
                <CardTitle>正在批改：{studentId}</CardTitle>
                <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
                  <Badge variant="secondary">共 {problems.length} 题</Badge>
                  <Badge variant="outline">
                    当前总分 {totalScore} / {totalMaxScore}
                  </Badge>
                  {hasUnsavedChanges ? (
                    <Badge variant="outline">有未保存修改</Badge>
                  ) : (
                    <Badge variant="outline">已同步当前填写内容</Badge>
                  )}
                </div>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              为每道题填写分数后，点击底部“确认评分并返回扫码页”。本页不再逐题单独确认。
            </p>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {problemPoints.map((problemPoint, index) => {
              const problem = problems[index];
              const displayScore = getDisplayScore(problem.id, problemPoint.points);
              const parsedScore = parseScore(displayScore);

              return (
                <div
                  key={problem.id}
                  className="flex h-full flex-col gap-4 rounded-xl border bg-muted/10 p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex flex-col gap-1">
                      <p className="font-medium">{problem.name}</p>
                      <p className="text-sm text-muted-foreground">
                        满分 {problem.maxPoint} 分
                      </p>
                    </div>
                    <Badge variant="outline">
                      {Number.isFinite(parsedScore) ? parsedScore : '-'} /{' '}
                      {problem.maxPoint}
                    </Badge>
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label htmlFor={`problem-score-${problem.id}`}>评分框</Label>
                    <Input
                      id={`problem-score-${problem.id}`}
                      type="number"
                      step={1}
                      min={0}
                      max={problem.maxPoint}
                      value={displayScore}
                      onChange={(event) => {
                        setEditedScores((prev) => ({
                          ...prev,
                          [problem.id]: event.target.value,
                        }));
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
      <div className="sticky bottom-4 flex flex-col gap-3 rounded-2xl border bg-background/95 p-4 shadow-lg backdrop-blur md:flex-row md:items-center md:justify-between">
        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium">完成当前考生阅卷</p>
          <p className="text-xs text-muted-foreground">
            提交后会保存所有题目分数，并自动返回扫码页继续下一位。
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={handleBackToReview}
            disabled={isSubmitting}
          >
            <ArrowLeft data-icon="inline-start" />
            返回扫码页
          </Button>
          <Button type="button" onClick={() => void handleSubmit()} loading={isSubmitting}>
            <CheckCircle2 data-icon="inline-start" />
            确认评分并返回扫码页
          </Button>
        </div>
      </div>
    </div>
  );
};
