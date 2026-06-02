import { db } from "@/db/drizzle";
import { flowStep, problem, userFlow, userPoint } from "@/db/schema";
import { verifyRole } from "@/lib/dal";
import { writeOperationAudit } from "@/lib/operation-audit";
import { logServerError } from "@/lib/server-error-log";
import { eq, inArray, InferInsertModel, sql } from "drizzle-orm";

type PointInsertValue = InferInsertModel<typeof userPoint>;

function normalizePointValues(values: Array<PointInsertValue>) {
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

async function assertPointValuesMatchFlow({
  userFlowId,
  problemIds,
  values,
}: ReturnType<typeof normalizePointValues>) {
  const [targetUserFlow] = await db
    .select({ flowId: userFlow.fkFlowId })
    .from(userFlow)
    .where(eq(userFlow.id, userFlowId))
    .limit(1);

  if (!targetUserFlow) {
    throw new Error("未找到考生流程");
  }

  const problemRows = await db
    .select({
      id: problem.id,
      maxScore: problem.score,
      flowId: flowStep.fkFlowId,
    })
    .from(problem)
    .innerJoin(flowStep, eq(problem.fkFlowStepId, flowStep.id))
    .where(inArray(problem.id, problemIds));

  if (problemRows.length !== problemIds.length) {
    throw new Error("部分题目不存在");
  }

  const problemById = new Map(problemRows.map((item) => [item.id, item]));

  values.forEach((value) => {
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
  });
}

export const upsertPoint = async (userFlowId: number, problemId: number, point: number) => {
  let session: Awaited<ReturnType<typeof verifyRole>> | null = null;

  try {
    session = await verifyRole(2);
    const normalized = normalizePointValues([{
      fkUserFlowId: userFlowId,
      fkProblemId: problemId,
      points: point,
    }]);
    await assertPointValuesMatchFlow(normalized);
    await db.insert(userPoint).values({
      fkUserFlowId: userFlowId,
      fkProblemId: problemId,
      points: point,
      fkJudgerId: session!.uid,
    }).onConflictDoUpdate({
      target: [userPoint.fkUserFlowId, userPoint.fkProblemId],
      set: {
        points: point,
        fkJudgerId: session!.uid,
      },
    });
    await writeOperationAudit({
      actorId: session.uid,
      action: "review.score.upsert",
      resourceType: "user_flow",
      resourceId: userFlowId,
      metadata: {
        problemIds: [problemId],
        totalScore: point,
      },
    });
  } catch (error) {
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
  let normalized: ReturnType<typeof normalizePointValues> | null = null;

  try {
    normalized = normalizePointValues(values);
    session = await verifyRole(2);
    await assertPointValuesMatchFlow(normalized);
    // ignore id here to avoid (conflict but not exist)
    await db.insert(userPoint).values(normalized.values.map(value => ({
      fkUserFlowId: value.fkUserFlowId,
      fkProblemId: value.fkProblemId,
      points: value.points,
      fkJudgerId: session!.uid,
    }))).onConflictDoUpdate({
      target: [userPoint.fkUserFlowId, userPoint.fkProblemId],
      set: {
        points: sql`excluded.points`,
        fkJudgerId: sql`excluded.fk_judger_id`,
      },
    });
    await writeOperationAudit({
      actorId: session.uid,
      action: "review.score.batch_upsert",
      resourceType: "user_flow",
      resourceId: normalized.userFlowId,
      metadata: {
        itemCount: normalized.values.length,
        problemIds: normalized.problemIds,
        totalScore: normalized.values.reduce((sum, value) => sum + value.points, 0),
      },
    });
  } catch (error) {
    logServerError("review:batchUpsertPoint", error, {
      path: "/dashboard/review/marking",
      action: "batch-upsert-point",
      userId: session?.uid ?? null,
      role: session?.role ?? null,
      userFlowId: normalized?.userFlowId ?? values[0]?.fkUserFlowId ?? null,
      metadata: {
        itemCount: normalized?.values.length ?? values.length,
        problemIds: normalized?.problemIds ?? values.map((value) => value.fkProblemId),
      },
    });
    throw error;
  }

};
