import { db } from "@/db/drizzle";
import { flowStep, normalizeDepartmentKey, operationAudit, problem, userFlow, userPoint } from "@/db/schema";
import { verifyScopedRole, type DepartmentScope } from "@/lib/authz";
import type { FlowScopedSession } from "@/action/flow/department-utils";
import { assertUserFlowInScope } from "@/lib/flow-access";
import { logServerError } from "@/lib/server-error-log";
import { MANAGER_ROLE } from "@/lib/link/role";
import { and, desc, eq, gte, inArray, InferInsertModel, sql } from "drizzle-orm";

type PointInsertValue = InferInsertModel<typeof userPoint>;
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

type NormalizedPointValue = {
  fkUserFlowId: number;
  fkProblemId: number;
  points: number;
  note: string | null;
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
  previousNote: string | null;
  nextNote: string | null;
  /* 本题改动前后的阅卷人：覆盖他人评分时 previousJudgerId != nextJudgerId */
  previousJudgerId: number | null;
  nextJudgerId: number;
};

type ValidatedScoreChanges = {
  targetUserId: number;
  department: string | null;
  changes: ScoreAuditChange[];
};

const SCORE_AUDIT_AGGREGATION_WINDOW_MS = 30 * 60 * 1000;

async function writeAggregatedScoreAudit(
  tx: Tx,
  {
    actorId,
    actorRole,
    userFlowId,
    targetUserId,
    department,
    changes,
  }: {
    actorId: number;
    actorRole: number | null;
    userFlowId: number;
    targetUserId: number;
    department: string | null;
    changes: ScoreAuditChange[];
  },
) {
  const now = new Date();
  const [recentAudit] = await tx
    .select({ id: operationAudit.id, metadata: operationAudit.metadata })
    .from(operationAudit)
    .where(and(
      eq(operationAudit.actorId, actorId),
      eq(operationAudit.action, "review.score.upsert"),
      eq(operationAudit.resourceType, "user_flow"),
      eq(operationAudit.resourceId, userFlowId),
      gte(operationAudit.createdAt, new Date(now.getTime() - SCORE_AUDIT_AGGREGATION_WINDOW_MS)),
    ))
    .orderBy(desc(operationAudit.createdAt))
    .limit(1);

  if (!recentAudit) {
    await tx.insert(operationAudit).values({
      actorId,
      actorRole,
      action: "review.score.upsert",
      resourceType: "user_flow",
      resourceId: userFlowId,
      department: normalizeDepartmentKey(department),
      metadata: { targetUserId, scoreChanges: changes, saveCount: 1 },
      createdAt: now,
    });
    return;
  }

  const previousMetadata = recentAudit.metadata ?? {};
  const previousChanges = Array.isArray(previousMetadata.scoreChanges)
    ? previousMetadata.scoreChanges.filter((value): value is ScoreAuditChange => (
      typeof value === "object" && value !== null && "problemId" in value
    ))
    : [];
  const mergedByProblemId = new Map(previousChanges.map((change) => [change.problemId, change]));

  for (const change of changes) {
    const previous = mergedByProblemId.get(change.problemId);
    mergedByProblemId.set(change.problemId, previous
      ? {
        ...change,
        previousScore: previous.previousScore,
        previousNote: previous.previousNote,
        previousJudgerId: previous.previousJudgerId ?? null,
      }
      : change);
  }

  const previousSaveCount = previousMetadata.saveCount;
  await tx
    .update(operationAudit)
    .set({
      metadata: {
        ...previousMetadata,
        targetUserId,
        scoreChanges: Array.from(mergedByProblemId.values()),
        saveCount: typeof previousSaveCount === "number" ? previousSaveCount + 1 : 2,
      },
      createdAt: now,
    })
    .where(eq(operationAudit.id, recentAudit.id));
}

export class ReviewPointConflictError extends Error {
  readonly conflicts: number[];

  constructor(message = "本题已由其他批卷人保存", conflicts: number[] = []) {
    super(message);
    this.name = "ReviewPointConflictError";
    this.conflicts = conflicts;
  }
}

/**
 * 评分校验失败，且原因需要回显给批卷页（结果已确认、试卷已变更、超出新满分…）。
 * 这类错误由 API 映射成 422 并把原文给前端，不像内部错误那样被兜底成「操作失败」。
 */
export class ScoreValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ScoreValidationError";
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

    if (value.note !== undefined && value.note !== null && typeof value.note !== "string") {
      throw new Error("题目备注无效");
    }

    problemIds.add(value.fkProblemId);

    return {
      fkUserFlowId: userFlowId,
      fkProblemId: value.fkProblemId,
      points: value.points,
      note: typeof value.note === "string" ? value.note.trim() || null : null,
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
  scope: DepartmentScope,
  actor: Pick<FlowScopedSession, "uid" | "role">,
): Promise<ValidatedScoreChanges> {
  await tx.execute(
    sql`select 1 from ${userFlow} where ${userFlow.id} = ${userFlowId} for update`,
  );

  const [targetUserFlow] = await tx
    .select({
      flowId: userFlow.fkFlowId,
      progressStatus: userFlow.progressStatus,
      targetUserId: userFlow.fkUserId,
      department: userFlow.department,
    })
    .from(userFlow)
    .where(eq(userFlow.id, userFlowId))
    .limit(1);

  if (!targetUserFlow) {
    throw new ScoreValidationError("未找到考生流程");
  }

  // 只能给本部门可见的候选人评分
  assertUserFlowInScope(scope, targetUserFlow.department);

  if (
    targetUserFlow.progressStatus === "passed" ||
    targetUserFlow.progressStatus === "failed"
  ) {
    throw new ScoreValidationError("该考生笔试结果已确认，不能再修改评分");
  }

  /* 已退回/未参与的报名不再给讲师评分；部长及以上仍可改（误确认后的更正通道） */
  if (
    targetUserFlow.progressStatus === "withdrawn" &&
    !canOverrideOthersScore(actor.role)
  ) {
    throw new ScoreValidationError("该考生已退回当前流程，不能再修改评分");
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
      .select({
        problemId: userPoint.fkProblemId,
        points: userPoint.points,
        note: userPoint.note,
        judgerId: userPoint.fkJudgerId,
      })
      .from(userPoint)
      .where(
        and(
          eq(userPoint.fkUserFlowId, userFlowId),
          inArray(userPoint.fkProblemId, problemIds),
        ),
      ),
  ]);

  if (problemRows.length !== problemIds.length) {
    throw new ScoreValidationError("试卷已变更，部分题目不存在，请重新设置阅卷范围");
  }

  const problemById = new Map(problemRows.map((item) => [item.id, item]));
  const previousPointByProblemId = new Map(
    existingPoints.map((item) => [
      item.problemId,
      { points: item.points, note: item.note ?? null, judgerId: item.judgerId ?? null },
    ]),
  );

  const changes = values.map((value) => {
    const targetProblem = problemById.get(value.fkProblemId);

    if (!targetProblem) {
      throw new ScoreValidationError("试卷已变更，部分题目不存在，请重新设置阅卷范围");
    }

    if (targetProblem.flowId !== targetUserFlow.flowId) {
      throw new ScoreValidationError("题目不属于当前考生流程，请重新设置阅卷范围");
    }

    if (value.points > targetProblem.maxScore) {
      throw new ScoreValidationError(`得分不能超过题目满分 ${targetProblem.maxScore}`);
    }

    const previous = previousPointByProblemId.get(value.fkProblemId);
    const nextNote = value.note;
    return {
      problemId: value.fkProblemId,
      problemTitle: targetProblem.title,
      previousScore: previous?.points ?? null,
      nextScore: value.points,
      previousNote: previous?.note ?? null,
      nextNote,
      previousJudgerId: previous?.judgerId ?? null,
      nextJudgerId: actor.uid,
    };
  });

  return {
    targetUserId: targetUserFlow.targetUserId,
    department: targetUserFlow.department,
    changes: changes.filter(
      (change) =>
        change.previousScore !== change.nextScore ||
        change.previousNote !== change.nextNote ||
        change.previousJudgerId !== change.nextJudgerId,
    ),
  };
}

/** 覆盖他人已保存评分的最低角色：部长及以上；讲师只能写本人或无人占用的题 */
export const canOverrideOthersScore = (role: number) => role >= MANAGER_ROLE;

function getScoreOverwriteCondition(session: Pick<FlowScopedSession, "uid" | "role">) {
  if (canOverrideOthersScore(session.role)) {
    return sql`true`;
  }

  return sql`${userPoint.fkJudgerId} is null or ${userPoint.fkJudgerId} = ${session.uid}`;
}

export const upsertPoint = async (
  userFlowId: number,
  problemId: number,
  point: number,
  note?: string | null,
) => {
  let session: FlowScopedSession | null = null;

  try {
    session = await verifyScopedRole(2);
    const actor = session;
    const normalized = normalizePointValues([
      { fkUserFlowId: userFlowId, fkProblemId: problemId, points: point, note },
    ]);
    const { rows } = await db.transaction(async (tx) => {
      const validated = await validateScoreChanges(tx, normalized, actor.scope, actor);
      const rows = await tx
        .insert(userPoint)
        .values({
          fkUserFlowId: userFlowId,
          fkProblemId: problemId,
          points: point,
          note: normalized.values[0].note,
          fkJudgerId: actor.uid,
        })
        .onConflictDoUpdate({
          target: [userPoint.fkUserFlowId, userPoint.fkProblemId],
          set: { points: point, note: normalized.values[0].note, fkJudgerId: actor.uid },
          setWhere: getScoreOverwriteCondition(actor),
        })
        .returning({ id: userPoint.id });

      if (rows.length > 0 && validated.changes.length > 0) {
        await writeAggregatedScoreAudit(tx, {
          actorId: actor.uid,
          actorRole: actor.realRole,
          userFlowId,
          targetUserId: validated.targetUserId,
          department: validated.department,
          changes: validated.changes,
        });
      }

      return { rows };
    });

    if (rows.length === 0) {
      throw new ReviewPointConflictError(undefined, [problemId]);
    }

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
      metadata: { problemId, point, note: note ?? null },
    });
    throw error;
  }
};

export const batchUpsertPoint = async (values: Array<PointInsertValue>) => {
  let session: FlowScopedSession | null = null;

  try {
    session = await verifyScopedRole(2);
    const actor = session;
    const normalized = normalizePointValues(values);
    const actorId = actor.uid;
    await db.transaction(async (tx) => {
      const validated = await validateScoreChanges(tx, normalized, actor.scope, actor);
      const rows = await tx
        .insert(userPoint)
        .values(
          normalized.values.map((value) => ({
            fkUserFlowId: value.fkUserFlowId,
            fkProblemId: value.fkProblemId,
            points: value.points,
            note: value.note,
            fkJudgerId: actorId,
          })),
        )
        .onConflictDoUpdate({
          target: [userPoint.fkUserFlowId, userPoint.fkProblemId],
          set: {
            points: sql`excluded.points`,
            note: sql`excluded.note`,
            fkJudgerId: sql`excluded.fk_judger_id`,
          },
          setWhere: getScoreOverwriteCondition(actor),
        })
        .returning({ problemId: userPoint.fkProblemId });

      const savedProblemIds = new Set(rows.map((row) => row.problemId));
      const conflicts = normalized.values
        .map((value) => value.fkProblemId)
        .filter((problemId) => !savedProblemIds.has(problemId));

      if (conflicts.length > 0) {
        throw new ReviewPointConflictError("部分题目已由其他批卷人保存", conflicts);
      }

      if (validated.changes.length > 0) {
        await writeAggregatedScoreAudit(tx, {
          actorId,
          actorRole: actor.realRole,
          userFlowId: normalized.userFlowId,
          targetUserId: validated.targetUserId,
          department: validated.department,
          changes: validated.changes,
        });
      }
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
