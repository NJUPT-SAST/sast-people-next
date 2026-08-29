'use server';
import { db } from '@/db/drizzle';
import { flowStep, problem, userFlow } from '@/db/schema';
import { userPoint } from '@/db/schema';
import { verifyRole } from '@/lib/dal';
import { listPeopleUsersByLinkIds } from '@/lib/link/user-lookup';
import { logServerError } from '@/lib/server-error-log';
import { asc, desc, eq, sql } from 'drizzle-orm';

export const calScore = async (flowId: number) => {
  let session: Awaited<ReturnType<typeof verifyRole>> | null = null;

  try {
    session = await verifyRole(2);
    const totalScore = sql<string>`coalesce(sum(${userPoint.points}), 0)`;
    const [examResult, problems, pointRows] = await Promise.all([
      db.select({
          uid: userFlow.fkUserId,
          stepId: flowStep.order,
          status: userFlow.progressStatus,
          totalScore,
        })
        .from(userFlow)
        .leftJoin(flowStep, eq(userFlow.fkCurrentStepId, flowStep.id))
        .leftJoin(userPoint, eq(userPoint.fkUserFlowId, userFlow.id))
        .where(eq(userFlow.fkFlowId, flowId))
        .groupBy(userFlow.fkUserId, flowStep.order, userFlow.progressStatus)
        .orderBy(desc(totalScore)),
      db
        .select({
          id: problem.id,
          title: problem.title,
          score: problem.score,
        })
        .from(problem)
        .innerJoin(flowStep, eq(problem.fkFlowStepId, flowStep.id))
        .where(eq(flowStep.fkFlowId, flowId))
        .orderBy(asc(flowStep.order), asc(problem.id)),
      db
        .select({
          uid: userFlow.fkUserId,
          problemId: userPoint.fkProblemId,
          points: userPoint.points,
          judgerId: userPoint.fkJudgerId,
        })
        .from(userFlow)
        .innerJoin(userPoint, eq(userPoint.fkUserFlowId, userFlow.id))
        .where(eq(userFlow.fkFlowId, flowId)),
    ]);

    const userMap = await listPeopleUsersByLinkIds(
      [
        ...examResult.map((row) => row.uid),
        ...pointRows
          .map((row) => row.judgerId)
          .filter((id): id is number => id !== null),
      ],
      { canViewSensitiveInfo: session.role >= 3 },
    );

    const pointMap = new Map(
      pointRows.map((row) => [
        `${row.uid}-${row.problemId}`,
        {
          points: row.points,
          judgerName: row.judgerId ? userMap.get(row.judgerId)?.name ?? null : null,
        },
      ]),
    );
    const gradedUidSet = new Set(pointRows.map((row) => row.uid));

    return examResult.map((row) => ({
      ...row,
      name: userMap.get(row.uid)?.name ?? '未知用户',
      studentId: userMap.get(row.uid)?.studentId ?? null,
      isGraded: gradedUidSet.has(row.uid),
      problemScores: problems.map((item) => ({
        ...pointMap.get(`${row.uid}-${item.id}`),
        id: item.id,
        title: item.title,
        score: item.score,
        points: pointMap.get(`${row.uid}-${item.id}`)?.points ?? 0,
        judgerName: pointMap.get(`${row.uid}-${item.id}`)?.judgerName ?? null,
      })),
    }));
  } catch (error) {
    logServerError('review:calScore', error, {
      path: '/dashboard/review',
      userId: session?.uid ?? null,
      role: session?.role ?? null,
      action: 'calculate-score-list',
      flowId,
    });
    throw error;
  }
};
export type ScoreRow = Awaited<ReturnType<typeof calScore>>[number];
