"use server";

import { db } from "@/db/drizzle";
import { emailBatch, emailDelivery, flow, user } from "@/db/schema";
import { verifyRole } from "@/lib/dal";
import { desc, eq, inArray } from "drizzle-orm";

export async function listEmailBatches() {
  await verifyRole(3);

  const batches = await db
    .select({
      id: emailBatch.id,
      templateKey: emailBatch.templateKey,
      subject: emailBatch.subject,
      accept: emailBatch.accept,
      status: emailBatch.status,
      totalCount: emailBatch.totalCount,
      flowId: emailBatch.fkFlowId,
      createdAt: emailBatch.createdAt,
      updatedAt: emailBatch.updatedAt,
      flowTitle: flow.title,
      createdByName: user.name,
    })
    .from(emailBatch)
    .innerJoin(flow, eq(flow.id, emailBatch.fkFlowId))
    .leftJoin(user, eq(user.id, emailBatch.fkCreatedBy))
    .orderBy(desc(emailBatch.createdAt))
    .limit(20);

  if (batches.length === 0) {
    return [];
  }

  const deliveries = await db
    .select({
      id: emailDelivery.id,
      batchId: emailDelivery.fkEmailBatchId,
      userFlowId: emailDelivery.fkUserFlowId,
      userId: emailDelivery.fkUserId,
      toAddress: emailDelivery.toAddress,
      subject: emailDelivery.subject,
      status: emailDelivery.status,
      errorMessage: emailDelivery.errorMessage,
      sentAt: emailDelivery.sentAt,
      htmlSnapshot: emailDelivery.htmlSnapshot,
      userName: user.name,
      studentId: user.studentId,
    })
    .from(emailDelivery)
    .innerJoin(user, eq(user.id, emailDelivery.fkUserId))
    .where(inArray(emailDelivery.fkEmailBatchId, batches.map((batch) => batch.id)))
    .orderBy(desc(emailDelivery.createdAt));

  return batches.map((batch) => {
    const batchDeliveries = deliveries.filter((item) => item.batchId === batch.id);
    return {
      ...batch,
      deliveries: batchDeliveries,
      counts: {
        pending: batchDeliveries.filter((item) => item.status === "pending").length,
        sending: batchDeliveries.filter((item) => item.status === "sending").length,
        sent: batchDeliveries.filter((item) => item.status === "sent").length,
        failed: batchDeliveries.filter((item) => item.status === "failed").length,
      },
    };
  });
}
