"use server";
import { verifyRole } from "@/lib/dal";
import {
  requireBooleanInput,
  requirePositiveIntegerArrayInput,
  requirePositiveIntegerInput,
} from "@/lib/email-center/action-input";
import { createResultEmailBatch } from "@/lib/email-center/batch";
import { writeOperationAudit } from "@/lib/operation-audit";
import { logServerError } from "@/lib/server-error-log";

export const batchSendEmail = async (
  uidInput: unknown,
  flowIdInput: unknown,
  acceptInput: unknown,
) => {
  let session: Awaited<ReturnType<typeof verifyRole>> | null = null;
  let flowId: number | null = null;
  let accept: boolean | null = null;
  let targetUserIds: number[] = [];

  try {
    session = await verifyRole(3);
    targetUserIds = requirePositiveIntegerArrayInput(uidInput, "收件人用户 ID");
    flowId = requirePositiveIntegerInput(flowIdInput, "流程 ID");
    accept = requireBooleanInput(acceptInput, "结果通知类型");
    const actorId = session.uid;
    const result = await createResultEmailBatch({
      userIds: targetUserIds,
      flowId,
      accept,
      createdBy: actorId,
    });

    if (result.batchId) {
      await writeOperationAudit({
        actorId,
        action: "email.batch.create",
        resourceType: "email_batch",
        resourceId: result.batchId,
        metadata: {
          flowId,
          accept,
          targetUserCount: targetUserIds.length,
          deliveryCount: result.deliveryCount,
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
      userId: session?.uid ?? null,
      role: session?.role ?? null,
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
