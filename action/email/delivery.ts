"use server";

import { db } from "@/db/drizzle";
import { emailBatch, emailDelivery, flow } from "@/db/schema";
import { verifyManager } from "@/lib/authz";
import { requirePositiveIntegerInput } from "@/lib/email-center/action-input";
import { sendEmailDelivery } from "@/lib/email-center/delivery";
import { assertFlowEditable } from "@/lib/flow-access";
import { writeOperationAudit } from "@/lib/operation-audit";
import { logServerError } from "@/lib/server-error-log";
import { eq, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

/* 老投递可能把流程记在批次上，用别名 join 出批次流程以解析实际归属 */
const batchFlow = alias(flow, "batch_flow");

export async function retryEmailDelivery(deliveryIdInput: unknown) {
  let actorId: number | null = null;
  let actorRole: number | null = null;
  let deliveryId: number | null = null;
  let department: string | null = null;

  try {
    const session = await verifyManager();
    actorId = session.uid;
    actorRole = session.role;
    deliveryId = requirePositiveIntegerInput(deliveryIdInput, "邮件记录 ID");

    const [delivery] = await db
      .select({
        id: emailDelivery.id,
        status: emailDelivery.status,
        department: sql<string | null>`coalesce(${flow.department}, ${batchFlow.department})`,
      })
      .from(emailDelivery)
      .leftJoin(emailBatch, eq(emailBatch.id, emailDelivery.fkEmailBatchId))
      .leftJoin(flow, eq(flow.id, emailDelivery.fkFlowId))
      .leftJoin(batchFlow, eq(batchFlow.id, emailBatch.fkFlowId))
      .where(eq(emailDelivery.id, deliveryId))
      .limit(1);

    if (!delivery) {
      throw new Error("Email delivery not found");
    }
    if (delivery.status === "sent") {
      return { messageId: null, skipped: true };
    }

    /* 与列表可见性保持一致：投递自身未记录流程时回退到批次的流程 */
    department = delivery.department;
    assertFlowEditable(session.scope, department, "无权操作其他部门的邮件");

    const result = await sendEmailDelivery(delivery.id, {
      trigger: "manual_retry",
      triggeredBy: session.uid,
    });

    await writeOperationAudit({
      actorId: session.uid,
      actorRole: session.role,
      action: "email.delivery_retry",
      resourceType: "email_delivery",
      resourceId: delivery.id,
      department,
      metadata: { previousStatus: delivery.status },
    });

    return { messageId: result.messageId, skipped: false };
  } catch (error) {
    logServerError("email:retryDelivery", error, {
      path: "/dashboard/emails",
      userId: actorId,
      role: actorRole,
      action: "retry-email-delivery",
      metadata: { deliveryId },
    });
    throw error;
  }
}
