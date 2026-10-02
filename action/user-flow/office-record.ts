"use server";

import { db } from "@/db/drizzle";
import { flow, interviewEvaluation, operationAudit, userFlow } from "@/db/schema";
import { verifyManager } from "@/lib/authz";
import type { FlowScopedSession } from "@/action/flow/department-utils";
import { assertUserFlowInScope } from "@/lib/flow-access";
import { isOfficeInterviewFlow, OFFICE_INTERVIEW_FLOW_TYPE } from "@/const/flow";
import { listPeopleUsersByLinkIds } from "@/lib/link/user-lookup";
import { logServerError } from "@/lib/server-error-log";
import { and, desc, eq, inArray, ne } from "drizzle-orm";

/**
 * 办公类面试「全部记录」：把一位候选人的两轮面评与每轮名单确认结论聚合成可读快照。
 *
 * 面评来自 interview_evaluation（round 1/2）；名单确认结论来自「结束一面/二面」写下的
 * operation_audit 留档（metadata.decisions 是确认时刻的分数快照），
 * 因为分数在确认之后仍可能补录，快照才是「部长团据此敲定名单」的凭据。
 */

type RoundNumber = 1 | 2;

/** 办公类两轮收口动作的审计 action 名（写于 action/user-flow/office-rounds.ts） */
const OFFICE_ROUND_CLOSE_ACTIONS: Record<RoundNumber, string> = {
  1: "flow.office_round_one.close",
  2: "flow.office_round_two.close",
};

export type OfficeRecordEvaluation = {
  id: number;
  score: number | null;
  recommendation: "passed" | "failed" | null;
  content: string;
  authorName: string | null;
  isMine: boolean;
  createdAt: string;
};

export type OfficeRecordDecision = {
  passed: boolean;
  decidedAt: string | null;
  decidedBy: string | null;
  evaluationCount: number;
  averageScore: number | null;
};

export type OfficeRecordRound = {
  round: RoundNumber;
  evaluations: OfficeRecordEvaluation[];
  averageScore: number | null;
  decision: OfficeRecordDecision | null;
};

export type OfficeInterviewRecord = {
  candidate: {
    userFlowId: number;
    name: string;
    studentId: string | null;
    qq: string | null;
    choice: number | null;
    siblingDepartment: string | null;
    interviewSlot: string | null;
    status: string;
    round: number | null;
    finalDepartment: string | null;
  };
  /** 总是 [1, 2]：即使某一轮还没有任何记录也返回空轮次，界面直接渲染分区 */
  rounds: OfficeRecordRound[];
};

type DecisionSnapshot = {
  userFlowId: number;
  passed: boolean;
  evaluationCount: number;
  averageScore: number | null;
};

/** metadata 是 jsonb，无法静态约束，这里对 decisions 做一次防御性解析 */
const parseDecisionSnapshots = (
  metadata: Record<string, unknown> | null,
): DecisionSnapshot[] => {
  const raw = metadata?.decisions;
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const record = entry as Record<string, unknown>;
    if (typeof record.userFlowId !== "number") return [];
    return [
      {
        userFlowId: record.userFlowId,
        passed: record.passed === true,
        evaluationCount:
          typeof record.evaluationCount === "number" ? record.evaluationCount : 0,
        averageScore:
          typeof record.averageScore === "number" ? record.averageScore : null,
      },
    ];
  });
};

/** 与候选人列表、名单确认快照同口径：只计已提交/已通过且有分数的面评 */
const roundAverage = (
  evaluations: Array<{ round: number | null; status: string; score: number | null }>,
  round: RoundNumber,
): number | null => {
  const scores = evaluations
    .filter(
      (evaluation) =>
        evaluation.round === round &&
        (evaluation.status === "submitted" || evaluation.status === "approved") &&
        evaluation.score !== null,
    )
    .map((evaluation) => evaluation.score as number);
  if (scores.length === 0) return null;
  return (
    Math.round(
      (scores.reduce((sum, score) => sum + score, 0) / scores.length) * 10,
    ) / 10
  );
};

const isRecommendation = (value: string | null): value is "passed" | "failed" =>
  value === "passed" || value === "failed";

/** 办公类面试「全部记录」读取入口：仅本部门流程的候选人（管理员放行） */
export const getOfficeInterviewRecord = async (
  userFlowId: number,
): Promise<OfficeInterviewRecord> => {
  let session: FlowScopedSession | null = null;

  try {
    session = await verifyManager();

    const [candidate] = await db
      .select({
        userFlowId: userFlow.id,
        uid: userFlow.fkUserId,
        department: userFlow.department,
        choice: userFlow.choice,
        interviewSlot: userFlow.interviewSlot,
        status: userFlow.progressStatus,
        round: userFlow.round,
        finalDepartment: userFlow.finalDepartment,
        flowId: flow.id,
        flowType: flow.type,
      })
      .from(userFlow)
      .innerJoin(flow, eq(userFlow.fkFlowId, flow.id))
      .where(eq(userFlow.id, userFlowId))
      .limit(1);

    if (!candidate) {
      throw new Error("候选人不存在");
    }

    /* 跨部门越权照旧拒绝：报名归属部门必须落在当前 scope 内 */
    assertUserFlowInScope(session.scope, candidate.department);

    if (!isOfficeInterviewFlow(candidate.flowType)) {
      throw new Error("只有办公类部门面试有全部面试记录");
    }

    const evaluations = await db
      .select({
        id: interviewEvaluation.id,
        authorId: interviewEvaluation.fkUserId,
        score: interviewEvaluation.score,
        round: interviewEvaluation.round,
        recommendation: interviewEvaluation.recommendation,
        content: interviewEvaluation.content,
        status: interviewEvaluation.status,
        createdAt: interviewEvaluation.createdAt,
      })
      .from(interviewEvaluation)
      .where(eq(interviewEvaluation.fkUserFlowId, userFlowId))
      .orderBy(interviewEvaluation.round, interviewEvaluation.id);

    /* 名单确认留档：同一动作可能被重复执行（补发通知/重试发布），取最新一条 */
    const auditRows = await db
      .select({
        action: operationAudit.action,
        actorId: operationAudit.actorId,
        metadata: operationAudit.metadata,
        createdAt: operationAudit.createdAt,
      })
      .from(operationAudit)
      .where(
        and(
          eq(operationAudit.resourceType, "flow"),
          eq(operationAudit.resourceId, candidate.flowId),
          inArray(operationAudit.action, [
            OFFICE_ROUND_CLOSE_ACTIONS[1],
            OFFICE_ROUND_CLOSE_ACTIONS[2],
          ]),
        ),
      )
      .orderBy(desc(operationAudit.id));

    /* 同一用户另一条办公类报名（另一志愿）的部门，与候选人列表同口径 */
    const siblingRows = await db
      .select({ department: userFlow.department })
      .from(userFlow)
      .innerJoin(flow, eq(userFlow.fkFlowId, flow.id))
      .where(
        and(
          eq(userFlow.fkUserId, candidate.uid),
          eq(flow.type, OFFICE_INTERVIEW_FLOW_TYPE),
          eq(flow.isDeleted, false),
          ne(userFlow.progressStatus, "withdrawn"),
          ne(userFlow.id, userFlowId),
        ),
      );
    const siblingDepartment =
      siblingRows
        .map((row) => row.department)
        .find(
          (department) =>
            department !== null && department !== candidate.department,
        ) ?? null;

    const userMap = await listPeopleUsersByLinkIds(
      [
        candidate.uid,
        ...evaluations.map((evaluation) => evaluation.authorId),
        ...auditRows.map((row) => row.actorId),
      ],
      { canViewSensitiveInfo: true },
    );

    const rounds = ([1, 2] as const).map((round): OfficeRecordRound => {
      const roundEvaluations = evaluations.filter(
        (evaluation) => evaluation.round === round,
      );
      /* 名单可能分多次确认（撤回后重新报名会再次关闭同一轮）：按最新优先逐条向前找，
         直到某次关闭的快照里出现该候选人，避免用「最后一次全局快照」覆盖掉更早的确认结论 */
      let audit: (typeof auditRows)[number] | undefined;
      let snapshot: DecisionSnapshot | undefined;
      for (const row of auditRows) {
        if (row.action !== OFFICE_ROUND_CLOSE_ACTIONS[round]) continue;
        const entry = parseDecisionSnapshots(row.metadata).find(
          (item) => item.userFlowId === userFlowId,
        );
        if (entry) {
          audit = row;
          snapshot = entry;
          break;
        }
      }

      return {
        round,
        evaluations: roundEvaluations.map((evaluation) => ({
          id: evaluation.id,
          score: evaluation.score,
          recommendation: isRecommendation(evaluation.recommendation)
            ? evaluation.recommendation
            : null,
          content: evaluation.content,
          authorName: userMap.get(evaluation.authorId)?.name ?? null,
          isMine: evaluation.authorId === session!.uid,
          createdAt: evaluation.createdAt.toISOString(),
        })),
        averageScore: roundAverage(evaluations, round),
        decision:
          audit && snapshot
            ? {
                passed: snapshot.passed,
                decidedAt: audit.createdAt.toISOString(),
                decidedBy: userMap.get(audit.actorId)?.name ?? null,
                evaluationCount: snapshot.evaluationCount,
                averageScore: snapshot.averageScore,
              }
            : null,
      };
    });

    return {
      candidate: {
        userFlowId: candidate.userFlowId,
        name: userMap.get(candidate.uid)?.name ?? "未知用户",
        studentId: userMap.get(candidate.uid)?.studentId ?? null,
        qq: userMap.get(candidate.uid)?.qq ?? null,
        choice: candidate.choice,
        siblingDepartment,
        interviewSlot: candidate.interviewSlot,
        status: candidate.status ?? "ongoing",
        round: candidate.round,
        finalDepartment: candidate.finalDepartment,
      },
      rounds,
    };
  } catch (error) {
    logServerError("office-record:get", error, {
      path: "/dashboard/interviews",
      userId: session?.uid ?? null,
      role: session?.role ?? null,
      action: "get-office-interview-record",
      metadata: { userFlowId },
    });
    throw error;
  }
};
