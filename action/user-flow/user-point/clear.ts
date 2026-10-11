'use server';

import { db } from '@/db/drizzle';
import { problem, userFlow, userPoint } from '@/db/schema';
import { canAccessDepartment, verifyScopedRole } from '@/lib/authz';
import type { FlowScopedSession } from '@/action/flow/department-utils';
import { ADMIN_ROLE } from '@/lib/link/role';
import { assertFlowResultsEditable } from '@/lib/flow-result-publication-guard';
import { writeOperationAudit } from '@/lib/operation-audit';
import { logServerError } from '@/lib/server-error-log';
import { and, eq, inArray } from 'drizzle-orm';

export type ClearPointsResult =
  | { success: true; clearedProblemIds: number[] }
  | { success: false; error: { message: string } };

type ClearOutcome =
  | { kind: 'missing' }
  | { kind: 'forbidden' }
  | { kind: 'locked'; message: string }
  | { kind: 'confirmed' }
  | { kind: 'empty' }
  | { kind: 'cleared'; clearedProblemIds: number[] };

/**
 * 清分（管理员）：删除 `user_point` 记录，让这些题目回到「未批卷」——
 * 与把分数改成 0 不同，删除后该题不再归属于原阅卷人，任何讲师都能重新认领批卷，
 * 考生也会按「没有一条评分记录」重新计入未批卷。
 *
 * `problemIds` 为空表示清空该考生在当前流程下的全部得分。
 */
export const clearPoints = async (
  userFlowId: number,
  problemIds: number[] = [],
): Promise<ClearPointsResult> => {
  let session: FlowScopedSession | null = null;

  try {
    if (!Number.isInteger(userFlowId) || userFlowId <= 0) {
      return { success: false, error: { message: '考生流程无效' } };
    }
    if (
      !Array.isArray(problemIds) ||
      problemIds.some((problemId) => !Number.isInteger(problemId) || problemId <= 0)
    ) {
      return { success: false, error: { message: '题目无效' } };
    }

    /* 清分是不可逆的删除（原分数只留在审计里），只给管理员 */
    session = await verifyScopedRole(ADMIN_ROLE);
    const actor = session;

    const outcome = await db.transaction<ClearOutcome>(async (tx) => {
      const [record] = await tx
        .select({
          flowId: userFlow.fkFlowId,
          progressStatus: userFlow.progressStatus,
          targetUserId: userFlow.fkUserId,
          department: userFlow.department,
        })
        .from(userFlow)
        .where(eq(userFlow.id, userFlowId))
        .limit(1)
        .for('update');

      if (!record) return { kind: 'missing' };

      if (!canAccessDepartment(actor.scope, record.department)) {
        return { kind: 'forbidden' };
      }

      try {
        await assertFlowResultsEditable(record.flowId);
      } catch (error) {
        /* 结果在发布中 / 已发布时名单与分数锁定：清分会让已发出的结果与分数对不上 */
        return {
          kind: 'locked',
          message: error instanceof Error ? error.message : '该流程结果已锁定，不能再清分',
        };
      }

      if (record.progressStatus === 'passed' || record.progressStatus === 'failed') {
        return { kind: 'confirmed' };
      }

      const existingPoints = await tx
        .select({
          problemId: userPoint.fkProblemId,
          points: userPoint.points,
          note: userPoint.note,
          judgerId: userPoint.fkJudgerId,
          problemTitle: problem.title,
        })
        .from(userPoint)
        .leftJoin(problem, eq(problem.id, userPoint.fkProblemId))
        .where(
          and(
            eq(userPoint.fkUserFlowId, userFlowId),
            problemIds.length > 0
              ? inArray(userPoint.fkProblemId, problemIds)
              : undefined,
          ),
        );

      if (existingPoints.length === 0) return { kind: 'empty' };

      const clearedProblemIds = existingPoints.map((point) => point.problemId);

      await tx
        .delete(userPoint)
        .where(
          and(
            eq(userPoint.fkUserFlowId, userFlowId),
            inArray(userPoint.fkProblemId, clearedProblemIds),
          ),
        );

      /* `nextScore: null` = 该题回到未批卷；原分数与阅卷人留在审计里可回溯 */
      await writeOperationAudit(
        {
          actorId: actor.uid,
          actorRole: actor.realRole,
          action: 'review.score.clear',
          resourceType: 'user_flow',
          resourceId: userFlowId,
          department: record.department,
          metadata: {
            targetUserId: record.targetUserId,
            clearedCount: clearedProblemIds.length,
            scoreChanges: existingPoints.map((point) => ({
              problemId: point.problemId,
              problemTitle: point.problemTitle ?? `题目 #${point.problemId}`,
              previousScore: point.points,
              nextScore: null,
              previousNote: point.note ?? null,
              nextNote: null,
              previousJudgerId: point.judgerId ?? null,
              nextJudgerId: null,
            })),
          },
        },
        { executor: tx },
      );

      return { kind: 'cleared', clearedProblemIds };
    });

    switch (outcome.kind) {
      case 'missing':
        return { success: false, error: { message: '未找到考生流程' } };
      case 'forbidden':
        return { success: false, error: { message: '无权操作其他部门的候选人' } };
      case 'locked':
        return { success: false, error: { message: outcome.message } };
      case 'confirmed':
        return { success: false, error: { message: '该考生笔试结果已确认，不能再清分' } };
      case 'empty':
        return { success: false, error: { message: '没有可清除的得分' } };
      default:
        return { success: true, clearedProblemIds: outcome.clearedProblemIds };
    }
  } catch (error) {
    logServerError('review:clearPoints', error, {
      path: '/dashboard/exams',
      action: 'clear-points',
      userId: session?.uid ?? null,
      role: session?.role ?? null,
      userFlowId,
      metadata: { problemIds },
    });
    throw error;
  }
};
