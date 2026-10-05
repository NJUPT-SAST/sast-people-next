'use server';
import { db } from '@/db/drizzle';
import { flowStep, problem, userFlow } from '@/db/schema';
import { userPoint } from '@/db/schema';
import { verifyScopedRole, departmentScopeFilter } from '@/lib/authz';
import { isFlowVisibleToScope } from '@/lib/flow-access';
import type { FlowScopedSession } from '@/action/flow/department-utils';
import { listPeopleUsersByLinkIds } from '@/lib/link/user-lookup';
import { logServerError } from '@/lib/server-error-log';
import { and, asc, desc, eq, sql } from 'drizzle-orm';

export const calScore = async (flowId: number) => {
  let session: FlowScopedSession | null = null;

  try {
    session = await verifyScopedRole(2);
    /* 读路径用过滤不用断言：流程不在本人可见范围（其他部门/未归属全局流程）时不返回任何题目与考生 */
    if (!(await isFlowVisibleToScope(session.scope, flowId))) {
      return [];
    }
    /* 同一名考生在同一流程下的归属一致，聚合展示其一即可 */
    const departmentScope = departmentScopeFilter(userFlow.department, session.scope);
    const totalScore = sql<string>`coalesce(sum(${userPoint.points}), 0)`;
    const [examResult, problems, pointRows] = await Promise.all([
      db.select({
          uid: userFlow.fkUserId,
          stepId: flowStep.order,
          status: userFlow.progressStatus,
          totalScore,
          department: sql<string | null>`min(${userFlow.department})`,
        })
        .from(userFlow)
        .leftJoin(flowStep, eq(userFlow.fkCurrentStepId, flowStep.id))
        .leftJoin(userPoint, eq(userPoint.fkUserFlowId, userFlow.id))
        .where(and(eq(userFlow.fkFlowId, flowId), departmentScope))
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
          note: userPoint.note,
          judgerId: userPoint.fkJudgerId,
        })
        .from(userFlow)
        .innerJoin(userPoint, eq(userPoint.fkUserFlowId, userFlow.id))
        .where(and(eq(userFlow.fkFlowId, flowId), departmentScope)),
    ]);

    const userMap = await listPeopleUsersByLinkIds(
      [
        ...examResult.map((row) => row.uid),
        ...pointRows
          .map((row) => row.judgerId)
          .filter((id): id is number => id !== null),
      ],
      {
        /* QQ 是笔试通知与群联络要用的，讲师（role 2）就要看到；手机号仍只在部长及以上下发 */
        canViewQq: session.role >= 2,
      },
    );

    const pointMap = new Map(
      pointRows.map((row) => [
        `${row.uid}-${row.problemId}`,
        {
          points: row.points,
          note: row.note,
          judgerName: row.judgerId ? userMap.get(row.judgerId)?.name ?? null : null,
        },
      ]),
    );
    const gradedUidSet = new Set(pointRows.map((row) => row.uid));

    return examResult.map((row) => ({
      ...row,
      name: userMap.get(row.uid)?.name ?? '未知用户',
      studentId: userMap.get(row.uid)?.studentId ?? null,
      qq: userMap.get(row.uid)?.qq ?? null,
      isGraded: gradedUidSet.has(row.uid),
      problemScores: problems.map((item) => ({
        ...pointMap.get(`${row.uid}-${item.id}`),
        id: item.id,
        title: item.title,
        score: item.score,
        points: pointMap.get(`${row.uid}-${item.id}`)?.points ?? 0,
        judgerName: pointMap.get(`${row.uid}-${item.id}`)?.judgerName ?? null,
        note: pointMap.get(`${row.uid}-${item.id}`)?.note ?? null,
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
