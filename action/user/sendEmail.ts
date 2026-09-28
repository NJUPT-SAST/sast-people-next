"use server";
import { verifyManager } from "@/lib/authz";
import { assertFlowEditable } from "@/lib/flow-access";
import { db } from "@/db/drizzle";
import {
  requireBooleanInput,
  requirePositiveIntegerArrayInput,
  requirePositiveIntegerInput,
} from "@/lib/email-center/action-input";
import { createResultEmailBatch } from "@/lib/email-center/batch";
import { writeOperationAudit } from "@/lib/operation-audit";
import { logServerError } from "@/lib/server-error-log";
import { flow } from "@/db/schema";
import { eq } from "drizzle-orm";

export const batchSendEmail = async (
  uidInput: unknown,
  flowIdInput: unknown,
  acceptInput: unknown,
  excludedUserIdsInput?: unknown,
) => {
  let actorId: number | null = null;
  let actorRole: number | null = null;
  let flowId: number | null = null;
  let accept: boolean | null = null;
  let targetUserIds: number[] = [];

  try {
    const session = await verifyManager();
    actorId = session.uid;
    actorRole = session.role;
    targetUserIds = requirePositiveIntegerArrayInput(uidInput, "收件人用户 ID");
    flowId = requirePositiveIntegerInput(flowIdInput, "流程 ID");
    accept = requireBooleanInput(acceptInput, "结果通知类型");
    const excludedUserIds = excludedUserIdsInput === undefined
      ? []
      : Array.from(new Set(
          (Array.isArray(excludedUserIdsInput) ? excludedUserIdsInput : [])
            .map((value) => requirePositiveIntegerInput(value, "排除发送的用户 ID")),
        ));
    const [flowRecord] = await db
      .select({ type: flow.type, department: flow.department })
      .from(flow)
      .where(eq(flow.id, flowId))
      .limit(1);
    /* 邮件批次归属流程：只有流程归属部门或管理员可以创建 */
    assertFlowEditable(session.scope, flowRecord?.department, "无权为其他部门的流程发送邮件");
    const result = await createResultEmailBatch({
      userIds: targetUserIds,
      flowId,
      accept,
      createdBy: actorId,
      flowType: flowRecord?.type ?? "recruitment",
    });

    if (result.batchId) {
      await writeOperationAudit({
        actorId: session.uid,
        actorRole: session.role,
        action: "email.batch.create",
        resourceType: "email_batch",
        resourceId: result.batchId,
        department: flowRecord?.department ?? null,
        metadata: {
          flowId,
          accept,
          targetUserCount: targetUserIds.length,
          deliveryCount: result.deliveryCount,
          excludedUserCount: excludedUserIds.length,
        },
      });
    }

    return result;
  } catch (error) {
    let action = "send-result-email";
    if (accept === true) {
      action = "send-acceptance-email";
    } else if (accept === false) {
      action = "send-rejection-email";
    }

    logServerError("email:batchSend", error, {
      path: "/dashboard/review",
      userId: actorId,
      role: actorRole,
      action,
      flowId,
      metadata: {
        targetUserIds,
        accept,
      },
    });
    throw error;
  }
};
