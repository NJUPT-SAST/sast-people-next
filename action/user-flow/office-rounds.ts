"use server";

import { publishFlowResults } from "@/action/flow/result-publication";
import { db } from "@/db/drizzle";
import { flow, flowStep, interviewEvaluation, userFlow } from "@/db/schema";
import { verifyManager } from "@/lib/authz";
import { createOfficeRoundOneEmailBatch } from "@/lib/email-center/batch";
import { assertFlowEditableRecord } from "@/lib/flow-access";
import { assertFlowResultsEditable } from "@/lib/flow-result-publication-guard";
import { isOfficeInterviewFlow } from "@/const/flow";
import { writeOperationAudit } from "@/lib/operation-audit";
import { logServerError } from "@/lib/server-error-log";
import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

/**
 * 办公类部门面试的两轮收口：
 * - 一面：部长在名单里逐人确认通过/不通过 → 通过者进入二面、未通过者结束 → 发送一面结果通知；
 * - 二面：部长确认最终名单（同一人通过多个部门时按「最终去向」处理冲突）→ 发布结果并发送最终通知。
 *
 * 办公类没有讲师这一级、也没有面评审批：面试记录（内容 + 分数）只做留档，
 * 结果一律由部长在名单确认时决定，所以这里同时写状态并发通知。
 */

export type OfficeCandidateDecision = {
  userFlowId: number;
  passed: boolean;
};

export type CloseOfficeRoundOneResult =
  | {
      success: true;
      /** 本次确认的通过/不通过人数（补发通知时为 0） */
      passCount: number;
      rejectCount: number;
      /** 本次新入队的通知封数 */
      sent: number;
      /** 邮件队列不可用等情况下只提示，不阻断名单确认 */
      emailWarning?: string;
    }
  | { success: false; error: { message: string } };

export type CloseOfficeFinalResult =
  | { success: true; publishedCount: number }
  | { success: false; error: { message: string } };

type EditableOfficeFlow =
  | { kind: "error"; message: string }
  | {
      kind: "ok";
      flowRow: {
        id: number;
        title: string;
        type: string;
        department: string | null;
      };
    };

/* 事务或普通连接：名单确认必须整段跑在同一个事务里 */
type Executor =
  | typeof db
  | Parameters<Parameters<typeof db.transaction>[0]>[0];

const ROSTER_CONFLICT_MESSAGE = "名单已变化，请刷新后重新确认";

const loadEditableOfficeFlow = async (
  flowId: number,
  session: Awaited<ReturnType<typeof verifyManager>>,
): Promise<EditableOfficeFlow> => {
  const [flowRow] = await db
    .select({
      id: flow.id,
      title: flow.title,
      type: flow.type,
      department: flow.department,
      isDeleted: flow.isDeleted,
    })
    .from(flow)
    .where(eq(flow.id, flowId))
    .limit(1);
  if (!flowRow || flowRow.isDeleted) {
    return { kind: "error", message: "流程不存在" };
  }
  assertFlowEditableRecord(session.scope, flowRow);
  return { kind: "ok", flowRow };
};

const getStepIdByOrder = async (
  executor: Executor,
  flowId: number,
  order: number,
) => {
  const rows = await executor
    .select({ id: flowStep.id })
    .from(flowStep)
    .where(
      and(
        eq(flowStep.fkFlowId, flowId),
        eq(flowStep.order, order),
        eq(flowStep.isDeleted, false),
      ),
    )
    .limit(1);
  return rows[0]?.id ?? null;
};

/**
 * 留档：名单确认时把每位候选人的结果与当时的平均分/份数写进审计。
 * 分数之后仍可能补录，所以确认时刻的快照是「部长团根据面评分数敲定名单」的凭据。
 */
const buildDecisionSnapshot = async (
  executor: Executor,
  round: number,
  decided: Map<number, boolean>,
) => {
  const ids = [...decided.keys()];
  if (ids.length === 0) return [];
  const rows = await executor
    .select({ userFlowId: interviewEvaluation.fkUserFlowId, score: interviewEvaluation.score })
    .from(interviewEvaluation)
    .where(
      and(
        inArray(interviewEvaluation.fkUserFlowId, ids),
        eq(interviewEvaluation.round, round),
        inArray(interviewEvaluation.status, ["submitted", "approved"]),
        isNotNull(interviewEvaluation.score),
      ),
    );
  const stats = new Map<number, { sum: number; count: number }>();
  for (const row of rows) {
    if (row.score === null) continue;
    const prev = stats.get(row.userFlowId) ?? { sum: 0, count: 0 };
    stats.set(row.userFlowId, { sum: prev.sum + row.score, count: prev.count + 1 });
  }
  return ids.map((userFlowId) => {
    const stat = stats.get(userFlowId);
    return {
      userFlowId,
      passed: decided.get(userFlowId) ?? false,
      evaluationCount: stat?.count ?? 0,
      averageScore: stat ? Math.round((stat.sum / stat.count) * 10) / 10 : null,
    };
  });
};

const validateRoundDecisions = async ({
  executor,
  flowId,
  round,
  decisions,
}: {
  executor: Executor;
  flowId: number;
  round: number;
  decisions: OfficeCandidateDecision[];
}) => {
  const pending = await executor
    .select({ id: userFlow.id })
    .from(userFlow)
    .where(
      and(
        eq(userFlow.fkFlowId, flowId),
        eq(userFlow.progressStatus, "ongoing"),
        eq(userFlow.round, round),
      ),
    );
  const pendingIds = new Set(pending.map((row) => row.id));
  const decided = new Map(
    decisions.map((decision) => [decision.userFlowId, decision.passed]),
  );
  if ([...decided.keys()].some((id) => !pendingIds.has(id))) {
    return { kind: "error" as const, message: ROSTER_CONFLICT_MESSAGE };
  }
  const missing = [...pendingIds].filter((id) => !decided.has(id));
  if (missing.length > 0) {
    return {
      kind: "error" as const,
      message: `还有 ${missing.length} 名候选人未确认结果，请全部确认后再提交`,
    };
  }
  return { kind: "ok" as const, decided, pendingCount: pendingIds.size };
};

/**
 * 名单确认事务：加流程级锁 → 复查名单 → 写入 → 留档快照。
 * 锁 + 条件更新保证两个部长同时确认、或候选人恰好被撤回时，
 * 不会出现「后提交覆盖前提交」与「撤回者被复活」。
 */
const commitRosterDecisions = async ({
  flowId,
  round,
  decisions,
  audit,
  apply,
}: {
  flowId: number;
  round: number;
  decisions: OfficeCandidateDecision[];
  /** 留档写在与名单同一条事务里：任何一步失败都整体回滚，重试时可重新补齐 */
  audit: {
    actorId: number;
    actorRole: number | null;
    action: string;
    department: string | null;
  };
  apply: (
    tx: Executor,
    decided: Map<number, boolean>,
  ) => Promise<void>;
}): Promise<
  | { kind: "error"; message: string }
  | {
      kind: "empty";
    }
  | {
      kind: "ok";
      decided: Map<number, boolean>;
      snapshot: Awaited<ReturnType<typeof buildDecisionSnapshot>>;
    }
> => {
  try {
    return await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(${flowId})`);
      /* 结果一旦发布/正在发布，名单与结果都锁定（转成结构化错误，不炸到调用方） */
      try {
        await assertFlowResultsEditable(flowId);
      } catch (error) {
        return {
          kind: "error" as const,
          message:
            error instanceof Error
              ? error.message
              : "该流程结果正在发布或已经发布，名单和结果已锁定",
        };
      }

      const validated = await validateRoundDecisions({
        executor: tx,
        flowId,
        round,
        decisions,
      });
      if (validated.kind === "error") {
        return { kind: "error" as const, message: validated.message };
      }
      if (validated.pendingCount === 0) return { kind: "empty" as const };

      await apply(tx, validated.decided);

      /* 留档：确认时刻的名单与分数快照，与名单写入同事务 */
      const snapshot = await buildDecisionSnapshot(tx, round, validated.decided);
      let passCount = 0;
      for (const passed of validated.decided.values()) {
        passCount += passed ? 1 : 0;
      }
      await writeOperationAudit(
        {
          actorId: audit.actorId,
          actorRole: audit.actorRole,
          action: audit.action,
          resourceType: "flow",
          resourceId: flowId,
          department: audit.department,
          metadata: {
            passCount,
            rejectCount: validated.decided.size - passCount,
            /* 留档：确认时刻的名单与当时分数快照 */
            decisions: snapshot,
          },
        },
        { executor: tx },
      );

      return {
        kind: "ok" as const,
        decided: validated.decided,
        snapshot,
      };
    });
  } catch (error) {
    if (error instanceof Error && error.message === ROSTER_CONFLICT_MESSAGE) {
      return { kind: "error" as const, message: error.message };
    }
    throw error;
  }
};

/** 结束一面：按名单写入通过/不通过并发送一面结果通知（重复调用只补发未发送的邮件） */
export const closeOfficeRoundOne = async (
  flowId: number,
  decisions: OfficeCandidateDecision[],
  confirmTemplate: boolean,
): Promise<CloseOfficeRoundOneResult> => {
  let session: Awaited<ReturnType<typeof verifyManager>> | null = null;
  try {
    session = await verifyManager();
    if (!confirmTemplate) {
      return {
        success: false,
        error: { message: "发送前必须确认本年度通过和不通过邮件模板" },
      };
    }
    const loaded = await loadEditableOfficeFlow(flowId, session);
    if (loaded.kind === "error") {
      return { success: false, error: { message: loaded.message } };
    }
    if (!isOfficeInterviewFlow(loaded.flowRow.type)) {
      return {
        success: false,
        error: { message: "只有办公类部门面试需要确认一面名单" },
      };
    }

    const outcome = await commitRosterDecisions({
      flowId,
      round: 1,
      decisions,
      audit: {
        actorId: session.uid,
        actorRole: session.realRole,
        action: "flow.office_round_one.close",
        department: loaded.flowRow.department,
      },
      apply: async (tx, decided) => {
        const secondRoundStepId = await getStepIdByOrder(tx, flowId, 3);
        const resultStepId = await getStepIdByOrder(tx, flowId, 4);
        let updated = 0;
        for (const [userFlowId, passed] of decided) {
          /* 条件更新：候选人必须仍是「一面进行中」，撤回/已被别人确认的行不动 */
          const rows = await tx
            .update(userFlow)
            .set(
              passed
                ? {
                    progressStatus: "ongoing",
                    round: 2,
                    fkCurrentStepId: secondRoundStepId,
                    updatedAt: new Date(),
                  }
                : {
                    progressStatus: "failed",
                    round: 1,
                    fkCurrentStepId: resultStepId,
                    updatedAt: new Date(),
                  },
            )
            .where(
              and(
                eq(userFlow.id, userFlowId),
                eq(userFlow.progressStatus, "ongoing"),
                eq(userFlow.round, 1),
              ),
            )
            .returning({ id: userFlow.id });
          updated += rows.length;
        }
        if (updated !== decided.size) {
          throw new Error(ROSTER_CONFLICT_MESSAGE);
        }
      },
    });
    if (outcome.kind === "error") {
      return { success: false, error: { message: outcome.message } };
    }

    let passCount = 0;
    let rejectCount = 0;
    if (outcome.kind === "ok") {
      for (const passed of outcome.decided.values()) {
        passCount += passed ? 1 : 0;
        rejectCount += passed ? 0 : 1;
      }
    }

    /* 发送一面结果通知：已发送的不重复；邮件服务不可用时只提示，名单确认仍然生效 */
    let emailWarning: string | undefined;
    let sent = 0;
    try {
      const [accepted, rejected] = await Promise.all([
        createOfficeRoundOneEmailBatch({ flowId, createdBy: session.uid, accept: true }),
        createOfficeRoundOneEmailBatch({ flowId, createdBy: session.uid, accept: false }),
      ]);
      sent = (accepted?.recipientCount ?? 0) + (rejected?.recipientCount ?? 0);
      if (sent === 0) {
        emailWarning = "没有需要发送的一面结果通知（可能已全部发送过）";
      }
    } catch (error) {
      emailWarning =
        error instanceof Error
          ? error.message
          : "一面结果通知发送失败，请稍后在邮件中心重试";
      logServerError("flow:office-round-one:email", error, {
        path: "/dashboard/interviews",
        userId: session.uid,
        role: session.role,
        action: "close-office-round-one",
        metadata: { flowId },
      });
    }

    revalidatePath("/dashboard/interviews");
    revalidatePath("/dashboard/user-flow");
    revalidatePath("/dashboard/emails");
    return {
      success: true,
      passCount,
      rejectCount,
      sent,
      ...(emailWarning ? { emailWarning } : {}),
    };
  } catch (error) {
    logServerError("flow:office-round-one:close", error, {
      path: "/dashboard/interviews",
      userId: session?.uid ?? null,
      role: session?.role ?? null,
      action: "close-office-round-one",
      metadata: { flowId },
    });
    throw error;
  }
};

/** 结束二面并发布最终结果：按名单写入通过/不通过，再走结果发布（同步身份 + 发送结果邮件） */
export const closeOfficeRoundTwo = async (
  flowId: number,
  decisions: OfficeCandidateDecision[],
  notifyUserFlowIds: number[],
  confirmTemplate: boolean,
): Promise<CloseOfficeFinalResult> => {
  let session: Awaited<ReturnType<typeof verifyManager>> | null = null;
  try {
    session = await verifyManager();
    if (!confirmTemplate) {
      return {
        success: false,
        error: { message: "发布前必须确认本年度结果邮件模板" },
      };
    }
    const loaded = await loadEditableOfficeFlow(flowId, session);
    if (loaded.kind === "error") {
      return { success: false, error: { message: loaded.message } };
    }
    if (!isOfficeInterviewFlow(loaded.flowRow.type)) {
      return {
        success: false,
        error: { message: "只有办公类部门面试需要确认二面名单" },
      };
    }

    const outcome = await commitRosterDecisions({
      flowId,
      round: 2,
      decisions,
      audit: {
        actorId: session.uid,
        actorRole: session.realRole,
        action: "flow.office_round_two.close",
        department: loaded.flowRow.department,
      },
      apply: async (tx, decided) => {
        const resultStepId = await getStepIdByOrder(tx, flowId, 4);
        let updated = 0;
        for (const [userFlowId, passed] of decided) {
          /* 条件更新：候选人必须仍是「二面进行中」，撤回/已被别人确认的行不动 */
          const rows = await tx
            .update(userFlow)
            .set({
              progressStatus: passed ? "passed" : "failed",
              fkCurrentStepId: resultStepId,
              updatedAt: new Date(),
            })
            .where(
              and(
                eq(userFlow.id, userFlowId),
                eq(userFlow.progressStatus, "ongoing"),
                eq(userFlow.round, 2),
              ),
            )
            .returning({ id: userFlow.id });
          updated += rows.length;
        }
        if (updated !== decided.size) {
          throw new Error(ROSTER_CONFLICT_MESSAGE);
        }
      },
    });
    if (outcome.kind === "error") {
      return { success: false, error: { message: outcome.message } };
    }

    try {
      const published = await publishFlowResults(flowId, confirmTemplate, notifyUserFlowIds);
      revalidatePath("/dashboard/interviews");
      revalidatePath("/dashboard/emails");
      return { success: true, publishedCount: published.counts.total };
    } catch (error) {
      logServerError("flow:office-round-two:publish", error, {
        path: "/dashboard/interviews",
        userId: session.uid,
        role: session.role,
        action: "close-office-round-two",
        metadata: { flowId },
      });
      return {
        success: false,
        error: {
          message: `名单已确认，但结果发布失败：${
            error instanceof Error ? error.message : "请稍后重试"
          }`,
        },
      };
    }
  } catch (error) {
    logServerError("flow:office-round-two:close", error, {
      path: "/dashboard/interviews",
      userId: session?.uid ?? null,
      role: session?.role ?? null,
      action: "close-office-round-two",
      metadata: { flowId },
    });
    throw error;
  }
};
