"use server";

import { publishFlowResults } from "@/action/flow/result-publication";
import { db } from "@/db/drizzle";
import { flow, flowStep, userFlow } from "@/db/schema";
import { verifyManager } from "@/lib/authz";
import { createOfficeRoundOneEmailBatch } from "@/lib/email-center/batch";
import { assertFlowEditableRecord } from "@/lib/flow-access";
import { isOfficeInterviewFlow } from "@/const/flow";
import { writeOperationAudit } from "@/lib/operation-audit";
import { logServerError } from "@/lib/server-error-log";
import { and, eq } from "drizzle-orm";
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

const getStepIdByOrder = async (flowId: number, order: number) => {
  const [row] = await db
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
  return row?.id ?? null;
};

const validateRoundDecisions = async ({
  flowId,
  round,
  decisions,
}: {
  flowId: number;
  round: number;
  decisions: OfficeCandidateDecision[];
}) => {
  const pending = await db
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
    return { kind: "error" as const, message: "名单已变化，请刷新后重新确认" };
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

    const validated = await validateRoundDecisions({ flowId, round: 1, decisions });
    if (validated.kind === "error") {
      return { success: false, error: { message: validated.message } };
    }

    let passCount = 0;
    let rejectCount = 0;
    if (validated.pendingCount > 0) {
      const secondRoundStepId = await getStepIdByOrder(flowId, 3);
      const resultStepId = await getStepIdByOrder(flowId, 4);
      for (const passed of validated.decided.values()) {
        passCount += passed ? 1 : 0;
        rejectCount += passed ? 0 : 1;
      }
      await db.transaction(async (tx) => {
        for (const [userFlowId, passed] of validated.decided) {
          await tx
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
            .where(eq(userFlow.id, userFlowId));
        }
      });
      await writeOperationAudit({
        actorId: session.uid,
        actorRole: session.role,
        action: "flow.office_round_one.close",
        resourceType: "flow",
        resourceId: flowId,
        department: loaded.flowRow.department,
        metadata: { passCount, rejectCount },
      });
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

    const validated = await validateRoundDecisions({ flowId, round: 2, decisions });
    if (validated.kind === "error") {
      return { success: false, error: { message: validated.message } };
    }

    if (validated.pendingCount > 0) {
      const resultStepId = await getStepIdByOrder(flowId, 4);
      await db.transaction(async (tx) => {
        for (const [userFlowId, passed] of validated.decided) {
          await tx
            .update(userFlow)
            .set({
              progressStatus: passed ? "passed" : "failed",
              fkCurrentStepId: resultStepId,
              updatedAt: new Date(),
            })
            .where(eq(userFlow.id, userFlowId));
        }
      });
      await writeOperationAudit({
        actorId: session.uid,
        actorRole: session.role,
        action: "flow.office_round_two.close",
        resourceType: "flow",
        resourceId: flowId,
        department: loaded.flowRow.department,
        metadata: {
          passCount: [...validated.decided.values()].filter(Boolean).length,
          rejectCount: [...validated.decided.values()].filter((passed) => !passed).length,
        },
      });
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
