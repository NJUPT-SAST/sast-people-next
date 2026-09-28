"use server";

import { db } from "@/db/drizzle";
import { emailBatch, flow } from "@/db/schema";
import { verifyManager } from "@/lib/authz";
import {
  recoverStaleEmailBatchById,
  sendEmailBatchById,
} from "@/lib/email-center/batch";
import { requirePositiveIntegerInput } from "@/lib/email-center/action-input";
import { assertFlowEditable } from "@/lib/flow-access";
import { writeOperationAudit } from "@/lib/operation-audit";
import { logServerError } from "@/lib/server-error-log";
import { eq } from "drizzle-orm";

/* 批次归属流程决定可见部门；未归属流程（fk_flow_id 为空）的历史批次仅管理员可操作 */
async function loadBatchFlowDepartment(batchId: number) {
  const [batch] = await db
    .select({ flowDepartment: flow.department })
    .from(emailBatch)
    .leftJoin(flow, eq(flow.id, emailBatch.fkFlowId))
    .where(eq(emailBatch.id, batchId))
    .limit(1);

  if (!batch) {
    throw new Error("邮件批次不存在");
  }
  return batch.flowDepartment;
}

export async function sendEmailBatch(batchIdInput: unknown) {
  let actorId: number | null = null;
  let actorRole: number | null = null;
  let batchId: number | null = null;
  let flowDepartment: string | null = null;

  try {
    const session = await verifyManager();
    actorId = session.uid;
    actorRole = session.role;
    batchId = requirePositiveIntegerInput(batchIdInput, "邮件批次 ID");
    flowDepartment = await loadBatchFlowDepartment(batchId);
    assertFlowEditable(session.scope, flowDepartment, "无权操作其他部门的邮件批次");
    const result = await sendEmailBatchById(batchId);

    await writeOperationAudit({
      actorId: session.uid,
      actorRole: session.role,
      action: "email.batch_send",
      resourceType: "email_batch",
      resourceId: batchId,
      department: flowDepartment,
      metadata: {
        queuedCount: result.queuedCount,
      },
    });

    return result;
  } catch (error) {
    logServerError("email:sendBatch", error, {
      path: "/dashboard/emails",
      userId: actorId,
      role: actorRole,
      action: "send-email-batch",
      metadata: { batchId },
    });
    throw error;
  }
}

export async function recoverStaleEmailBatch(batchIdInput: unknown) {
  let actorId: number | null = null;
  let actorRole: number | null = null;
  let batchId: number | null = null;
  let flowDepartment: string | null = null;

  try {
    const session = await verifyManager();
    actorId = session.uid;
    actorRole = session.role;
    batchId = requirePositiveIntegerInput(batchIdInput, "邮件批次 ID");
    flowDepartment = await loadBatchFlowDepartment(batchId);
    assertFlowEditable(session.scope, flowDepartment, "无权操作其他部门的邮件批次");
    const result = await recoverStaleEmailBatchById(batchId);

    await writeOperationAudit({
      actorId: session.uid,
      actorRole: session.role,
      action: "email.recover_stale",
      resourceType: "email_batch",
      resourceId: batchId,
      department: flowDepartment,
      metadata: { recoveredCount: result.recoveredCount },
    });

    return result;
  } catch (error) {
    logServerError("email:recoverStaleBatch", error, {
      path: "/dashboard/emails",
      userId: actorId,
      role: actorRole,
      action: "recover-stale-email-batch",
      metadata: { batchId },
    });
    throw error;
  }
}
