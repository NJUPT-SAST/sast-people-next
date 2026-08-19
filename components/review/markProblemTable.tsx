'use client';

import { InferSelectModel } from 'drizzle-orm';
import { CheckCircle2 } from 'lucide-react';
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
  const [persistedScores, setPersistedScores] = useState<Record<number, number>>(
    () =>
      Object.fromEntries(
        points
          .filter((point) => point.fkProblemId !== null)
          .map((point) => [point.fkProblemId, point.points]),
      ),
  );
  const [scoreErrors, setScoreErrors] = useState<Record<number, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const problems = useLocalProblemList();

  const getDisplayScore = (problemId: number, existedScore: number | null) => {
    if (editedScores[problemId] !== undefined) return editedScores[problemId];
    if (persistedScores[problemId] !== undefined) return String(persistedScores[problemId]);
    if (existedScore === null) return '';
    return String(existedScore);
  };

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

  useEffect(() => {
    const timers = Object.entries(editedScores).map(([problemId, value]) => {
      const id = Number(problemId);
      const problem = problems.find((item) => item.id === id);
      const score = parseScore(value);
      const errorMessage = problem
        ? validateScore(problem.name, problem.maxPoint, score)
        : '题目不存在';

      if (errorMessage || !problem) {
        return null;
      }

      return window.setTimeout(() => {
        void fetch('/api/user-point', {
          method: 'POST',
          body: JSON.stringify({
            action: 'single',
            data: { userFlowId, problemId: id, point: score },
          }),
        })
          .then(async (response) => {
            if (!response.ok) {
              const error = await response.json();
              throw new Error(error.message || '评分自动保存失败');
            }

            setPersistedScores((previous) => ({ ...previous, [id]: score }));
            setScoreErrors((previous) => {
              const next = { ...previous };
              delete next[id];
              return next;
            });
            setEditedScores((previous) => {
              if (previous[id] !== value) return previous;
              const next = { ...previous };
              delete next[id];
              return next;
            });
          })
          .catch((error: unknown) => {
            setScoreErrors((previous) => ({
              ...previous,
              [id]: error instanceof Error ? error.message : '评分自动保存失败',
            }));
          });
      }, 500);
    });

    return () => {
      timers.forEach((timer) => {
        if (timer !== null) window.clearTimeout(timer);
      });
    };
  }, [editedScores, problems, userFlowId]);


  const problemPoints: Array<InferSelectModel<typeof userPoint>> = problems.map(
    (problem) => {
      const existed = points.find((point) => point.fkProblemId === problem.id);
      const currentScore = parseScore(
        getDisplayScore(problem.id, existed ? existed.points : null),
      );

      return {
        id: existed?.id ?? 0,
        fkUserFlowId: userFlowId,
        fkProblemId: problem.id,
        points: Number.isFinite(currentScore) ? currentScore : 0,
        fkJudgerId: existed?.fkJudgerId ?? null,
        createdAt: existed?.createdAt ?? new Date(),
      };
    },
  );

  const hasUnsavedChanges = Object.keys(editedScores).length > 0;

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
      const existed = points.find((point) => point.fkProblemId === problems[index].id);
      const score = parseScore(
        getDisplayScore(problems[index].id, existed ? existed.points : null),
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


  const handleSubmit = async () => {
    if (isSubmitting) {
      return;
    }

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
        error: (error) =>
          error instanceof Error ? error.message : '评分保存失败',
      });
      await request;
      setEditedScores({});
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
      <section key={userFlowId} className="border-y bg-muted/10">
        <header className="px-4 py-5 lg:px-6">
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
              <div className="flex flex-col gap-2">
                <CardTitle>正在批改：{studentId}</CardTitle>
                <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
                  <Badge variant="secondary">共 {problems.length} 题</Badge>
                  <Badge variant="outline">
                    当前总分 {totalScore} / {totalMaxScore}
                  </Badge>
                  {Object.keys(scoreErrors).length > 0 ? (
                    <Badge variant="outline">有待修正评分</Badge>
                  ) : hasUnsavedChanges ? (
                    <Badge variant="outline">正在自动保存</Badge>
                  ) : (
                    <Badge variant="outline">已自动保存</Badge>
                  )}
                </div>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              合法分数会自动保存。确认后返回扫码页继续下一位。
            </p>
          </div>
        </header>
        <div className="border-t px-4 py-5 lg:px-6">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {problemPoints.map((problemPoint, index) => {
              const problem = problems[index];
              const existed = points.find((point) => point.fkProblemId === problem.id);
              const displayScore = getDisplayScore(problem.id, existed ? existed.points : null);
              const parsedScore = parseScore(displayScore);
              const inputError = scoreErrors[problem.id];
              return (
                <div
                  key={problem.id}
                  className="flex h-full flex-col gap-4 rounded-md border bg-background p-4"
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
                      aria-describedby={
                        inputError ? `problem-score-error-${problem.id}` : undefined
                      }
                      aria-invalid={Boolean(inputError)}
                      onChange={(event) => {
                        const value = event.target.value;
                        const errorMessage = validateScore(
                          problem.name,
                          problem.maxPoint,
                          parseScore(value),
                        );

                        setEditedScores((previous) => ({
                          ...previous,
                          [problem.id]: value,
                        }));
                        setScoreErrors((previous) => {
                          const next = { ...previous };
                          if (errorMessage) {
                            next[problem.id] = errorMessage;
                          } else {
                            delete next[problem.id];
                          }
                          return next;
                        });
                      }}
                    />
                    {inputError && (
                      <p
                        id={`problem-score-error-${problem.id}`}
                        className="text-sm text-destructive"
                      >
                        {inputError}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>
      <div className="flex justify-end border-t px-4 pb-1 pt-4 lg:px-6">
        <Button
          type="button"
          className="h-10 w-full sm:w-auto"
          onClick={() => void handleSubmit()}
          loading={isSubmitting}
        >
          <CheckCircle2 data-icon="inline-start" />
          确认评分并返回扫码页
        </Button>
      </div>
    </div>
  );
};

