"use server";

/**
 * 阅卷公平性分析的数据加载（部门 scope 内，部长及以上）。
 *
 * 只读取 `user_point` 与题目满分，不做任何写入：该分析仅供人工参考，
 * 校正后的分数不会写回官方成绩（见 docs/GRADING_FAIRNESS_MODEL.md）。
 */

import { and, desc, eq, isNotNull, isNull, sql } from "drizzle-orm";

import { db } from "@/db/drizzle";
import { flow, flowStep, problem, userFlow, userPoint } from "@/db/schema";
import { departmentScopeFilter, verifyScopedRole } from "@/lib/authz";
import { isFlowVisibleToScope, visibleFlowPredicate } from "@/lib/flow-access";
import { fitGradingModel } from "@/lib/grading-fairness/model";
import type { GradingModelFit, GradingObservation } from "@/lib/grading-fairness/types";
import { listPeopleUsersByLinkIds } from "@/lib/link/user-lookup";
import { MANAGER_ROLE } from "@/lib/link/role";
import { logServerError } from "@/lib/server-error-log";

/** 可分析的流程（存在评分记录的笔试流程） */
export type GradingFairnessFlow = {
  id: number;
  title: string;
  department: string | null;
  observationCount: number;
  judgerCount: number;
};

export type GradingFairnessData = {
  flow: { id: number; title: string; department: string | null };
  observations: GradingObservation[];
  /** 考生（user_flow.id）→ 姓名 / 学号 */
  candidateLabels: Record<string, { name: string | null; studentId: string | null }>;
  /** 题目 → 标题 / 满分 */
  problemLabels: Record<string, { title: string; maxPoints: number }>;
  /** 讲师 → 姓名（Link 查询失败时为 null） */
  judgerLabels: Record<string, string | null>;
  /** 未记录阅卷人（fk_judger_id 为空）的评分行数：不进入模型 */
  unattributedCount: number;
  fit: GradingModelFit;
};

const countOf = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

/** 存在评分记录的流程列表（按开始时间倒序，部门 scope 过滤） */
export const listGradingFairnessFlows = async (): Promise<GradingFairnessFlow[]> => {
  const session = await verifyScopedRole(MANAGER_ROLE);

  try {
    const rows = await db
      .select({
        id: flow.id,
        title: flow.title,
        department: flow.department,
        observationCount: sql<number>`cast(count(${userPoint.id}) as int)`,
        judgerCount: sql<number>`cast(count(distinct ${userPoint.fkJudgerId}) as int)`,
      })
      .from(flow)
      .innerJoin(flowStep, eq(flowStep.fkFlowId, flow.id))
      .innerJoin(problem, eq(problem.fkFlowStepId, flowStep.id))
      .innerJoin(userPoint, eq(userPoint.fkProblemId, problem.id))
      .innerJoin(userFlow, eq(userFlow.id, userPoint.fkUserFlowId))
      .where(
        and(
          eq(flow.isDeleted, false),
          /* 与 fit.observationCount 同口径：只算有阅卷人的评分行 */
          isNotNull(userPoint.fkJudgerId),
          /* 与详情页同一套可见性（全局流程若本部门有报名也放行）+ 候选人部门过滤 */
          visibleFlowPredicate(session.scope),
          departmentScopeFilter(userFlow.department, session.scope),
        ),
      )
      .groupBy(flow.id, flow.title, flow.department, flow.startedAt)
      .orderBy(desc(flow.startedAt));

    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      department: row.department,
      observationCount: countOf(row.observationCount),
      judgerCount: countOf(row.judgerCount),
    }));
  } catch (error) {
    logServerError("grading-fairness:listFlows", error, {
      action: "list-grading-fairness-flows",
      userId: session.uid,
      role: session.role,
    });
    throw error;
  }
};

/** 某个流程的阅卷观测与模型拟合结果；流程不可见或不存在时返回 null */
export const loadGradingFairnessData = async (
  flowId: number,
): Promise<GradingFairnessData | null> => {
  const session = await verifyScopedRole(MANAGER_ROLE);

  try {
    const [target] = await db
      .select({ id: flow.id, title: flow.title, department: flow.department })
      .from(flow)
      .where(and(eq(flow.id, flowId), eq(flow.isDeleted, false)))
      .limit(1);

    if (!target) return null;
    /* 读路径用过滤不用断言：不在本人可见范围时不返回任何数据 */
    if (!(await isFlowVisibleToScope(session.scope, flowId))) return null;

    const [rows, unattributedRows] = await Promise.all([
      db
        .select({
          userFlowId: userPoint.fkUserFlowId,
          problemId: userPoint.fkProblemId,
          judgerId: userPoint.fkJudgerId,
          points: userPoint.points,
          maxPoints: problem.score,
          problemTitle: problem.title,
          candidateUserId: userFlow.fkUserId,
        })
        .from(userPoint)
        .innerJoin(problem, eq(problem.id, userPoint.fkProblemId))
        .innerJoin(flowStep, eq(flowStep.id, problem.fkFlowStepId))
        .innerJoin(userFlow, eq(userFlow.id, userPoint.fkUserFlowId))
        .where(
          and(
            eq(flowStep.fkFlowId, flowId),
            isNotNull(userPoint.fkJudgerId),
            /* 全局流程（department IS NULL）对本部门可见时，只分析本部门考生的卷子 */
            departmentScopeFilter(userFlow.department, session.scope),
          ),
        ),
      db
        .select({ count: sql<number>`cast(count(*) as int)` })
        .from(userPoint)
        .innerJoin(problem, eq(problem.id, userPoint.fkProblemId))
        .innerJoin(flowStep, eq(flowStep.id, problem.fkFlowStepId))
        .innerJoin(userFlow, eq(userFlow.id, userPoint.fkUserFlowId))
        .where(
          and(
            eq(flowStep.fkFlowId, flowId),
            isNull(userPoint.fkJudgerId),
            departmentScopeFilter(userFlow.department, session.scope),
          ),
        ),
    ]);

    const observations: GradingObservation[] = rows.map((row) => ({
      userFlowId: row.userFlowId,
      problemId: row.problemId,
      judgerId: row.judgerId as number,
      points: row.points,
      maxPoints: row.maxPoints,
    }));

    const problemLabels: Record<string, { title: string; maxPoints: number }> = {};
    for (const row of rows) {
      problemLabels[String(row.problemId)] = {
        title: row.problemTitle,
        maxPoints: row.maxPoints,
      };
    }

    const candidateUserIds = new Map<number, number>();
    for (const row of rows) candidateUserIds.set(row.userFlowId, row.candidateUserId);
    const judgerIds = Array.from(new Set(rows.map((row) => row.judgerId as number)));

    const candidateLabels: GradingFairnessData["candidateLabels"] = {};
    const judgerLabels: GradingFairnessData["judgerLabels"] = {};
    try {
      const users = await listPeopleUsersByLinkIds([
        ...new Set([...candidateUserIds.values(), ...judgerIds]),
      ]);
      for (const [userFlowId, userId] of candidateUserIds) {
        const user = users.get(userId);
        candidateLabels[String(userFlowId)] = {
          name: user?.name ?? null,
          studentId: user?.studentId ?? null,
        };
      }
      for (const judgerId of judgerIds) {
        judgerLabels[String(judgerId)] = users.get(judgerId)?.name ?? null;
      }
    } catch (error) {
      /* 姓名解析失败不该让整个分析页挂掉：标签留空，模型照算 */
      logServerError("grading-fairness:loadData", error, {
        action: "load-people-labels",
        flowId,
        userId: session.uid,
        metadata: { judgerCount: judgerIds.length, candidateCount: candidateUserIds.size },
      });
      for (const userFlowId of candidateUserIds.keys()) {
        candidateLabels[String(userFlowId)] = { name: null, studentId: null };
      }
      for (const judgerId of judgerIds) judgerLabels[String(judgerId)] = null;
    }

    return {
      flow: target,
      observations,
      candidateLabels,
      problemLabels,
      judgerLabels,
      unattributedCount: countOf(unattributedRows[0]?.count),
      fit: fitGradingModel(observations),
    };
  } catch (error) {
    logServerError("grading-fairness:loadData", error, {
      path: "/dashboard/review/analytics",
      action: "load-grading-fairness-data",
      userId: session.uid,
      role: session.role,
      flowId,
    });
    throw error;
  }
};
