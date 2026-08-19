import { db } from "@/db/drizzle";
import { flowStep, problem, userFlow, userPoint } from "@/db/schema";
import { verifyRole } from "@/lib/dal";
import { writeOperationAudit } from "@/lib/operation-audit";
import { logServerError } from "@/lib/server-error-log";
import { and, eq, inArray, InferInsertModel, sql } from "drizzle-orm";

type PointInsertValue = InferInsertModel<typeof userPoint>;
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

type NormalizedPointValue = {
  fkUserFlowId: number;
  fkProblemId: number;
  points: number;
};

type NormalizedPointValues = {
  userFlowId: number;
  problemIds: number[];
  values: NormalizedPointValue[];
};

type ScoreAuditChange = {
  problemId: number;
  problemTitle: string;
  previousScore: number | null;
  nextScore: number;
};

type ValidatedScoreChanges = {
  targetUserId: number;
  changes: ScoreAuditChange[];
};

export class ReviewPointConflictError extends Error {
  constructor(message = "评分已被其他批卷人保存，请刷新后查看") {
    super(message);
    this.name = "ReviewPointConflictError";
  }
}

function normalizePointValues(values: Array<PointInsertValue>): NormalizedPointValues {
  if (!Array.isArray(values) || values.length === 0) {
    throw new Error("评分列表不能为空");
  }

  const userFlowId = values[0]?.fkUserFlowId;
  const problemIds = new Set<number>();

  if (!Number.isInteger(userFlowId) || userFlowId <= 0) {
    throw new Error("考生流程无效");
  }

  const normalizedValues = values.map((value) => {
    if (value.fkUserFlowId !== userFlowId) {
      throw new Error("一次只能保存同一位考生的评分");
    }

    if (!Number.isInteger(value.fkProblemId) || value.fkProblemId <= 0) {
      throw new Error("题目无效");
    }

    if (problemIds.has(value.fkProblemId)) {
      throw new Error("一次提交不能包含重复题目");
    }

    if (!Number.isInteger(value.points) || value.points < 0) {
      throw new Error("得分必须是非负整数");
    }

    problemIds.add(value.fkProblemId);

    return {
      fkUserFlowId: userFlowId,
      fkProblemId: value.fkProblemId,
      points: value.points,
    };
  });

  return {
    userFlowId,
    problemIds: Array.from(problemIds),
    values: normalizedValues,
  };
}

async function validateScoreChanges(
  tx: Tx,
  { userFlowId, problemIds, values }: NormalizedPointValues,
): Promise<ValidatedScoreChanges> {
  await tx.execute(
    sql`select 1 from ${userFlow} where ${userFlow.id} = ${userFlowId} for update`,
  );

  const [targetUserFlow] = await tx
    .select({
      flowId: userFlow.fkFlowId,
      progressStatus: userFlow.progressStatus,
      targetUserId: userFlow.fkUserId,
    })
    .from(userFlow)
    .where(eq(userFlow.id, userFlowId))
    .limit(1);

  if (!targetUserFlow) {
    throw new Error("未找到考生流程");
  }

  if (
    targetUserFlow.progressStatus === "passed" ||
    targetUserFlow.progressStatus === "failed"
  ) {
    throw new Error("该考生笔试结果已确认，不能再修改评分");
  }

  const [problemRows, existingPoints] = await Promise.all([
    tx
      .select({
        id: problem.id,
        title: problem.title,
        maxScore: problem.score,
        flowId: flowStep.fkFlowId,
      })
      .from(problem)
      .innerJoin(flowStep, eq(problem.fkFlowStepId, flowStep.id))
      .where(inArray(problem.id, problemIds)),
    tx
      .select({ problemId: userPoint.fkProblemId, points: userPoint.points })
      .from(userPoint)
      .where(
        and(
          eq(userPoint.fkUserFlowId, userFlowId),
          inArray(userPoint.fkProblemId, problemIds),
        ),
      ),
  ]);

  if (problemRows.length !== problemIds.length) {
    throw new Error("部分题目不存在");
  }

  const problemById = new Map(problemRows.map((item) => [item.id, item]));
  const previousScoreByProblemId = new Map(
    existingPoints.map((item) => [item.problemId, item.points]),
  );

  const changes = values.map((value) => {
    const targetProblem = problemById.get(value.fkProblemId);

    if (!targetProblem) {
      throw new Error("题目不存在");
    }

    if (targetProblem.flowId !== targetUserFlow.flowId) {
      throw new Error("题目不属于当前考生流程");
    }

    if (value.points > targetProblem.maxScore) {
      throw new Error(`得分不能超过题目满分 ${targetProblem.maxScore}`);
    }

    return {
      problemId: value.fkProblemId,
      problemTitle: targetProblem.title,
      previousScore: previousScoreByProblemId.get(value.fkProblemId) ?? null,
      nextScore: value.points,
    };
  });

  return { targetUserId: targetUserFlow.targetUserId, changes };
}

function getScoreOverwriteCondition(session: Awaited<ReturnType<typeof verifyRole>>) {
  if (session.role >= 3) {
    return sql`true`;
  }

  return sql`${userPoint.fkJudgerId} is null or ${userPoint.fkJudgerId} = ${session.uid}`;
}

export const upsertPoint = async (userFlowId: number, problemId: number, point: number) => {
  let session: Awaited<ReturnType<typeof verifyRole>> | null = null;

  try {
    session = await verifyRole(2);
    const actor = session;
    const normalized = normalizePointValues([
      { fkUserFlowId: userFlowId, fkProblemId: problemId, points: point },
    ]);
    const { validated, rows } = await db.transaction(async (tx) => {
      const validated = await validateScoreChanges(tx, normalized);
      const rows = await tx
        .insert(userPoint)
        .values({
          fkUserFlowId: userFlowId,
          fkProblemId: problemId,
          points: point,
          fkJudgerId: actor.uid,
        })
        .onConflictDoUpdate({
          target: [userPoint.fkUserFlowId, userPoint.fkProblemId],
          set: { points: point, fkJudgerId: actor.uid },
          setWhere: getScoreOverwriteCondition(actor),
        })
        .returning({ id: userPoint.id });

      return { validated, rows };
    });

    if (rows.length === 0) {
      throw new ReviewPointConflictError();
    }

    await writeOperationAudit({
      actorId: actor.uid,
      action: "review.score.upsert",
      resourceType: "user_flow",
      resourceId: userFlowId,
      metadata: {
        targetUserId: validated.targetUserId,
        scoreChanges: validated.changes,
      },
    });
  } catch (error) {
    if (error instanceof ReviewPointConflictError) {
      throw error;
    }

    logServerError("review:upsertPoint", error, {
      path: "/dashboard/review/marking",
      action: "upsert-point",
      userId: session?.uid ?? null,
      role: session?.role ?? null,
      userFlowId,
      metadata: { problemId, point },
    });
    throw error;
  }
};

export const batchUpsertPoint = async (values: Array<PointInsertValue>) => {
  let session: Awaited<ReturnType<typeof verifyRole>> | null = null;

  try {
    session = await verifyRole(2);
    const actor = session;
    const normalized = normalizePointValues(values);
    const actorId = actor.uid;
    const { validated } = await db.transaction(async (tx) => {
      const validated = await validateScoreChanges(tx, normalized);
      const rows = await tx
        .insert(userPoint)
        .values(
          normalized.values.map((value) => ({
            fkUserFlowId: value.fkUserFlowId,
            fkProblemId: value.fkProblemId,
            points: value.points,
            fkJudgerId: actorId,
          })),
        )
        .onConflictDoUpdate({
          target: [userPoint.fkUserFlowId, userPoint.fkProblemId],
          set: {
            points: sql`excluded.points`,
            fkJudgerId: sql`excluded.fk_judger_id`,
          },
          setWhere: getScoreOverwriteCondition(actor),
        })
        .returning({ id: userPoint.id });

      if (rows.length !== normalized.values.length) {
        throw new ReviewPointConflictError("部分题目已被其他批卷人保存，请刷新后查看");
      }

      return { validated };
    });


    await writeOperationAudit({
      actorId,
      action: "review.score.batch_upsert",
      resourceType: "user_flow",
      resourceId: normalized.userFlowId,
      metadata: {
        targetUserId: validated.targetUserId,
        scoreChanges: validated.changes,
      },
    });
  } catch (error) {
    if (error instanceof ReviewPointConflictError) {
      throw error;
    }

    logServerError("review:batchUpsertPoint", error, {
      path: "/dashboard/review/marking",
      action: "batch-upsert-point",
      userId: session?.uid ?? null,
      role: session?.role ?? null,
      userFlowId: values[0]?.fkUserFlowId ?? null,
      metadata: {
        itemCount: values.length,
        problemIds: values.map((value) => value.fkProblemId),
      },
    });
    throw error;
  }
};
