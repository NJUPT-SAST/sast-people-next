'use server';
import { db } from '@/db/drizzle';
import { flowStep, problem, user, userFlow } from '@/db/schema';
import { userPoint } from '@/db/schema';
import { verifyRole } from '@/lib/dal';
import { aliasedTable, asc, desc, eq, sql } from 'drizzle-orm';

export const calScore = async (flowId: number) => {
  const session = await verifyRole(2);
  const judger = aliasedTable(user, 'judger');
  const totalScore = sql<string>`coalesce(sum(${userPoint.points}), 0)`;
  const examResult = await db.select({
      uid: user.id,
      stepId: userFlow.currentStepOrder,
      status: userFlow.status,
      name: user.name,
      studentId: user.studentId,
      phoneNumber: user.phone,
      totalScore,
    })
    .from(userFlow)
    .leftJoin(userPoint, eq(userPoint.fkUserFlowId, userFlow.id))
    .innerJoin(user, eq(userFlow.fkUserId, user.id))
    .where(eq(userFlow.fkFlowId, flowId))
    .groupBy(userFlow.currentStepOrder, userFlow.status, user.phone, user.studentId, user.name, user.id)
    .orderBy(desc(totalScore));

  const problems = await db
    .select({
      id: problem.id,
      title: problem.title,
      score: problem.score,
    })
    .from(problem)
    .innerJoin(flowStep, eq(problem.fkFlowStepId, flowStep.id))
    .where(eq(flowStep.fkFlowId, flowId))
    .orderBy(asc(flowStep.order), asc(problem.id));

  const pointRows = await db
    .select({
      uid: userFlow.fkUserId,
      problemId: userPoint.fkProblemId,
      points: userPoint.points,
      judgerName: judger.name,
    })
    .from(userFlow)
    .innerJoin(userPoint, eq(userPoint.fkUserFlowId, userFlow.id))
    .leftJoin(judger, eq(userPoint.fkJudgerId, judger.id))
    .where(eq(userFlow.fkFlowId, flowId));

  const pointMap = new Map(
    pointRows.map((row) => [
      `${row.uid}-${row.problemId}`,
      { points: row.points, judgerName: row.judgerName },
    ]),
  );
  const gradedUidSet = new Set(pointRows.map((row) => row.uid));

  return examResult.map((row) => ({
    ...row,
    phoneNumber: session.role >= 3 ? row.phoneNumber : null,
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
};
