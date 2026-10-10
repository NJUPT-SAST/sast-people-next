'use client';

import { InferSelectModel } from 'drizzle-orm';
import { CheckCircle2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';

import { useLocalProblemList } from '@/hooks/useLocalProblemList';
import type { LockedUserPoint } from '@/hooks/useUserPointList';
import { userPoint } from '@/db/schema';

import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '@/components/ui/textarea';

/** 服务端 409（评分已被他人保存）：带出冲突题目，前端据此把题目转为只读 */
class UserPointRequestError extends Error {
  readonly status: number;
  readonly conflicts: number[];

  constructor(message: string, status: number, conflicts: number[]) {
    super(message);
    this.name = 'UserPointRequestError';
    this.status = status;
    this.conflicts = conflicts;
  }
}

const getResponseMessage = (payload: unknown, fallback: string) => {
  if (typeof payload === 'object' && payload !== null && 'message' in payload) {
    const message = (payload as { message?: unknown }).message;
    if (typeof message === 'string' && message) return message;
  }

  return fallback;
};

const getResponseConflicts = (payload: unknown): number[] => {
  if (typeof payload === 'object' && payload !== null && 'conflicts' in payload) {
    const conflicts = (payload as { conflicts?: unknown }).conflicts;
    if (Array.isArray(conflicts)) {
      return conflicts.filter((value): value is number => typeof value === 'number');
    }
  }

  return [];
};

export const MarkProblemTable = ({
  points,
  locks,
  userFlowId,
  onReloadPoints,
}: {
  points: Array<InferSelectModel<typeof userPoint>>;
  locks: LockedUserPoint[];
  userFlowId: number;
  onReloadPoints: () => void;
}) => {
  const router = useRouter();
  const studentId = useSearchParams().get('user');

  const [editedScores, setEditedScores] = useState<Record<number, string>>({});
  const [editedNotes, setEditedNotes] = useState<Record<number, string>>({});
  const [persistedNotes, setPersistedNotes] = useState<Record<number, string | null>>(
    () => Object.fromEntries(points.filter((point) => point.fkProblemId !== null).map((point) => [point.fkProblemId, point.note ?? null])),
  );
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
  /* 保存时才发现被他人占用的题（服务端 409）：本地转入只读，等待重新拉取到对方分数 */
  const [runtimeLockedIds, setRuntimeLockedIds] = useState<ReadonlySet<number>>(
    () => new Set(),
  );
  const saveSequenceByProblemId = useRef(new Map<number, number>());
  const problems = useLocalProblemList();

  /* problemId → 占用者姓名（null 表示占用者未知，只显示"其他批卷人"） */
  const lockNames = useMemo(() => {
    const names = new Map<number, string | null>();
    locks.forEach((lock) => names.set(lock.problemId, lock.judgerName));
    runtimeLockedIds.forEach((problemId) => {
      if (!names.has(problemId)) names.set(problemId, null);
    });
    return names;
  }, [locks, runtimeLockedIds]);

  const applyLockedProblems = useCallback(
    (problemIds: number[]) => {
      if (problemIds.length === 0) return;

      setRuntimeLockedIds((previous) => new Set([...previous, ...problemIds]));
      setEditedScores((previous) => {
        const next = { ...previous };
        problemIds.forEach((problemId) => delete next[problemId]);
        return next;
      });
      setEditedNotes((previous) => {
        const next = { ...previous };
        problemIds.forEach((problemId) => delete next[problemId]);
        return next;
      });
      setScoreErrors((previous) => {
        const next = { ...previous };
        problemIds.forEach((problemId) => delete next[problemId]);
        return next;
      });
      onReloadPoints();
    },
    [onReloadPoints],
  );

  const getDisplayScore = useCallback((problemId: number, existedScore: number | null) => {
    if (editedScores[problemId] !== undefined) return editedScores[problemId];
    if (persistedScores[problemId] !== undefined) return String(persistedScores[problemId]);
    if (existedScore === null) return '';
    return String(existedScore);
  }, [editedScores, persistedScores]);

  /* 重新拉取时只回填未被本地编辑的题：用 ref 读取最新编辑状态，避免把编辑状态放进 effect 依赖 */
  const editedScoresRef = useRef(editedScores);
  const editedNotesRef = useRef(editedNotes);

  useEffect(() => {
    editedScoresRef.current = editedScores;
    editedNotesRef.current = editedNotes;
  }, [editedScores, editedNotes]);

  /* 重新拉取评分记录后（例如题目刚被他人占用），把未被本地编辑的题对齐到服务端值 */
  useEffect(() => {
    setPersistedScores((previous) => {
      const next = { ...previous };
      let changed = false;

      points.forEach((point) => {
        if (point.fkProblemId === null || editedScoresRef.current[point.fkProblemId] !== undefined) return;
        if (next[point.fkProblemId] === point.points) return;

        next[point.fkProblemId] = point.points;
        changed = true;
      });

      return changed ? next : previous;
    });

    setPersistedNotes((previous) => {
      const next = { ...previous };
      let changed = false;

      points.forEach((point) => {
        if (point.fkProblemId === null || editedNotesRef.current[point.fkProblemId] !== undefined) return;
        const note = point.note ?? null;
        if (next[point.fkProblemId] === note) return;

        next[point.fkProblemId] = note;
        changed = true;
      });

      return changed ? next : previous;
    });
  }, [points]);

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
    const controllers = new Map<number, AbortController>();
    const changedProblemIds = new Set([
      ...Object.keys(editedScores).map(Number),
      ...Object.keys(editedNotes).map(Number),
    ]);
    const timers = Array.from(changedProblemIds).map((id) => {
      /* 已被其他批卷人占用的题不参与自动保存 */
      if (lockNames.has(id)) return null;

      const sequence = (saveSequenceByProblemId.current.get(id) ?? 0) + 1;
      saveSequenceByProblemId.current.set(id, sequence);
      const problem = problems.find((item) => item.id === id);
      const scoreValue = getDisplayScore(id, points.find((point) => point.fkProblemId === id)?.points ?? null);
      const score = parseScore(scoreValue);
      const noteValue = editedNotes[id] ?? persistedNotes[id] ?? null;
      const errorMessage = problem
        ? validateScore(problem.name, problem.maxPoint, score)
        : '题目不存在';

      if (errorMessage || !problem) return null;

      const controller = new AbortController();
      controllers.set(id, controller);

      return window.setTimeout(() => {
        void fetch('/api/user-point', {
          method: 'POST',
          body: JSON.stringify({
            action: 'single',
            data: {
              userFlowId,
              problemId: id,
              point: score,
              ...(noteValue !== null ? { note: noteValue } : {}),
            },
          }),
          signal: controller.signal,
        })
          .then(async (response) => {
            if (!response.ok) {
              const error = await response.json().catch(() => null);
              throw new UserPointRequestError(
                getResponseMessage(error, '评分自动保存失败'),
                response.status,
                getResponseConflicts(error),
              );
            }

            if (
              controller.signal.aborted ||
              saveSequenceByProblemId.current.get(id) !== sequence
            ) {
              return;
            }

            setPersistedScores((previous) => ({ ...previous, [id]: score }));
            setPersistedNotes((previous) => ({ ...previous, [id]: editedNotes[id] ?? previous[id] ?? null }));
            setScoreErrors((previous) => {
              const next = { ...previous };
              delete next[id];
              return next;
            });
            setEditedScores((previous) => {
              if (previous[id] !== undefined && previous[id] !== scoreValue) return previous;
              const next = { ...previous };
              delete next[id];
              return next;
            });
            setEditedNotes((previous) => {
              if (previous[id] !== editedNotes[id]) return previous;
              const next = { ...previous };
              delete next[id];
              return next;
            });
          })
          .catch((error: unknown) => {
            if (
              controller.signal.aborted ||
              saveSequenceByProblemId.current.get(id) !== sequence
            ) {
              return;
            }

            if (error instanceof UserPointRequestError && error.status === 409) {
              applyLockedProblems(error.conflicts.length > 0 ? error.conflicts : [id]);
              return;
            }

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
      controllers.forEach((controller) => controller.abort());
    };
  }, [editedScores, editedNotes, persistedNotes, points, problems, userFlowId, getDisplayScore, lockNames, applyLockedProblems]);


  const getDisplayNote = (problemId: number, existedNote: string | null) => {
    if (editedNotes[problemId] !== undefined) return editedNotes[problemId];
    return persistedNotes[problemId] ?? existedNote ?? '';
  };

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
        note: getDisplayNote(problem.id, existed?.note ?? null) || null,
        createdAt: existed?.createdAt ?? new Date(),
      };
    },
  );

  const hasUnsavedChanges = Object.keys(editedScores).length > 0 || Object.keys(editedNotes).length > 0;

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
      const error = await response.json().catch(() => null);
      throw new UserPointRequestError(
        getResponseMessage(error, '批量更新失败'),
        response.status,
        getResponseConflicts(error),
      );
    }

    return response.json();
  };

  const buildValidatedPayload = () => {
    /* 他人批改的题不参与提交，避免整批因归属冲突回滚 */
    const editable = problems.flatMap((problem, index) =>
      lockNames.has(problem.id) ? [] : [{ problem, problemPoint: problemPoints[index] }],
    );

    const values = editable.map(({ problem, problemPoint }) => {
      const existed = points.find((point) => point.fkProblemId === problem.id);
      const score = parseScore(
        getDisplayScore(problem.id, existed ? existed.points : null),
      );
      const errorMessage = validateScore(problem.name, problem.maxPoint, score);

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

    /* 范围内全部题目都已被他人占用：直接返回扫码页 */
    if (values.length === 0) {
      router.push('/dashboard/review');
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
    } catch (error) {
      /* 归属冲突：把冲突题转只读并拉取对方分数，其余题目已保存，可再次确认返回 */
      if (error instanceof UserPointRequestError && error.status === 409) {
        applyLockedProblems(error.conflicts);
      }
      return;
    } finally {
      setIsSubmitting(false);
    }
  };

  const totalScore = problemPoints.reduce((sum, item) => sum + item.points, 0);
  const totalMaxScore = problems.reduce((sum, item) => sum + item.maxPoint, 0);
  const lockedProblemCount = problems.filter((problem) => lockNames.has(problem.id)).length;

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
                  {lockedProblemCount > 0 && (
                    <Badge variant="outline">{lockedProblemCount} 题由他人批改</Badge>
                  )}
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
              const lockedBy = lockNames.get(problem.id);
              const isLocked = lockNames.has(problem.id);
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
                      disabled={isLocked}
                      aria-describedby={
                        isLocked
                          ? `problem-score-locked-${problem.id}`
                          : inputError
                            ? `problem-score-error-${problem.id}`
                            : undefined
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
                    {isLocked && (
                      <p
                        id={`problem-score-locked-${problem.id}`}
                        className="text-sm text-destructive"
                      >
                        本题已由{lockedBy ? ` ${lockedBy} ` : '其他批卷人'}批改保存，无法修改；如需调整请联系部长。
                      </p>
                    )}
                    {!isLocked && inputError && (
                      <p
                        id={`problem-score-error-${problem.id}`}
                        className="text-sm text-destructive"
                      >
                        {inputError}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label htmlFor={`problem-note-${problem.id}`}>批卷备注</Label>
                    <Textarea
                      id={`problem-note-${problem.id}`}
                      value={getDisplayNote(problem.id, existed?.note ?? null)}
                      disabled={isLocked}
                      onChange={(event) =>
                        setEditedNotes((previous) => ({ ...previous, [problem.id]: event.target.value }))
                      }
                      placeholder="可填写对该题答案的评价或修改建议"
                      maxLength={2000}
                      rows={3}
                    />
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

