"use server";
import { db } from '@/db/drizzle';
import { userFlow, userPoint } from '@/db/schema';
import { verifyScopedRole } from '@/lib/authz';
import { assertUserFlowInScope } from '@/lib/flow-access';
import { canOverrideOthersScore } from '@/action/user-flow/user-point/upsert';
import { listPeopleUsersByLinkIds } from '@/lib/link/user-lookup';
import type { userType } from '@/types/user';
import { logServerError } from '@/lib/server-error-log';
import { desc, eq, InferSelectModel } from "drizzle-orm";

/** 已被其他批卷人保存、当前账号无权覆盖的题目 */
export type LockedUserPoint = {
  problemId: number;
  judgerId: number;
  judgerName: string | null;
};

export type UserPointListResult = {
  points: Array<InferSelectModel<typeof userPoint>>;
  locks: LockedUserPoint[];
};

export const useUserPointList = async (userFlowId: number): Promise<UserPointListResult> => {
  const session = await verifyScopedRole(2);
  try {
    // 只能读取本部门可见候选人的评分记录
    const [target] = await db
      .select({ department: userFlow.department })
      .from(userFlow)
      .where(eq(userFlow.id, userFlowId))
      .limit(1);

    if (!target) {
      return { points: [], locks: [] };
    }
    assertUserFlowInScope(session.scope, target.department);

    const userPoints = await db
      .select()
      .from(userPoint)
      .where(eq(userPoint.fkUserFlowId, userFlowId))
      .orderBy(desc(userPoint.fkProblemId));

    /* 部长及以上可以覆盖他人评分，不存在只读题；讲师只能写本人或无人占用的题 */
    if (canOverrideOthersScore(session.role)) {
      return { points: userPoints, locks: [] };
    }

    const ownedByOthers = userPoints.filter(
      (point) => point.fkJudgerId !== null && point.fkJudgerId !== session.uid,
    );

    if (ownedByOthers.length === 0) {
      return { points: userPoints, locks: [] };
    }

    let judgers = new Map<number, userType>();
    try {
      judgers = await listPeopleUsersByLinkIds([
        ...new Set(
          ownedByOthers.map((point) => point.fkJudgerId as number),
        ),
      ]);
    } catch (error) {
      logServerError('review:getUserPointList', error, {
        action: 'load-judger-names',
        userFlowId,
        metadata: { judgerCount: ownedByOthers.length },
      });
    }

    const locks = ownedByOthers.map((point) => ({
      problemId: point.fkProblemId,
      judgerId: point.fkJudgerId as number,
      judgerName: judgers.get(point.fkJudgerId as number)?.name ?? null,
    }));

    return { points: userPoints, locks };
  } catch (error) {
    logServerError('review:getUserPointList', error, {
      path: '/dashboard/review/marking',
      action: 'load-user-points',
      userId: session.uid,
      role: session.role,
      userFlowId,
    });
    throw error;
  }
};
