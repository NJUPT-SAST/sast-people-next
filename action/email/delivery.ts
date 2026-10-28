"use server";

import { db } from "@/db/drizzle";
import { emailBatch, emailCustomMessage, emailDelivery, flow } from "@/db/schema";
import { isAdmin, verifyManager } from "@/lib/authz";
import { requirePositiveIntegerInput } from "@/lib/email-center/action-input";
import { refreshCustomMessageStatus } from "@/lib/email-center/custom-message";
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
    actorRole = session.realRole;
    deliveryId = requirePositiveIntegerInput(deliveryIdInput, "邮件记录 ID");

    const [delivery] = await db
      .select({
        id: emailDelivery.id,
        category: emailDelivery.category,
        status: emailDelivery.status,
        customMessageId: emailDelivery.fkCustomMessageId,
        department: sql<string | null>`coalesce(${flow.department}, ${batchFlow.department})`,
        customCreatedBy: emailCustomMessage.createdBy,
        customDepartment: emailCustomMessage.department,
      })
      .from(emailDelivery)
      .leftJoin(emailBatch, eq(emailBatch.id, emailDelivery.fkEmailBatchId))
      .leftJoin(flow, eq(flow.id, emailDelivery.fkFlowId))
      .leftJoin(batchFlow, eq(batchFlow.id, emailBatch.fkFlowId))
      .leftJoin(
        emailCustomMessage,
        eq(emailCustomMessage.id, emailDelivery.fkCustomMessageId),
      )
      .where(eq(emailDelivery.id, deliveryId))
      .limit(1);

    if (!delivery) {
      throw new Error("Email delivery not found");
    }
    if (delivery.status === "sent") {
      return { messageId: null, skipped: true };
    }

    /* 与列表可见性保持一致：投递自身未记录流程时回退到批次的流程；
       收集表投递不属于任何流程，所有部长都可重试；自定义邮件按作者隔离 */
    department = delivery.department ?? delivery.customDepartment;
    if (delivery.category === "custom") {
      if (!isAdmin(session.role) && delivery.customCreatedBy !== session.uid) {
        throw new Error("无权操作其他人创建的自定义邮件");
      }
    } else if (delivery.category !== "collection") {
      assertFlowEditable(session.scope, department, "无权操作其他部门的邮件");
    }

    const refreshCustomParent = async () => {
      if (!delivery.customMessageId) return;
      await refreshCustomMessageStatus(delivery.customMessageId).catch(
        (refreshError) => {
          logServerError(
            "email:retryDelivery:refreshCustomMessage",
            refreshError,
            {
              action: "refresh-custom-message-after-retry",
              metadata: {
                deliveryId: delivery.id,
                customMessageId: delivery.customMessageId,
              },
            },
          );
        },
      );
    };

    const result = await sendEmailDelivery(delivery.id, {
      trigger: "manual_retry",
      triggeredBy: session.uid,
    }).catch(async (error) => {
      /* 手动重试失败也要把父邮件状态从 sending/failed 重新算一遍 */
      await refreshCustomParent();
      throw error;
    });

    await refreshCustomParent();

    await writeOperationAudit({
      actorId: session.uid,
      actorRole: session.realRole,
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
