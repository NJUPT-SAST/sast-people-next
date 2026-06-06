"use server";

import { db } from "@/db/drizzle";
import { emailBatch, emailDelivery, flow } from "@/db/schema";
import { verifyRole } from "@/lib/dal";
import { listPeopleUsersByLinkIds } from "@/lib/link/user-lookup";
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
      createdById: emailBatch.fkCreatedBy,
    })
    .from(emailBatch)
    .innerJoin(flow, eq(flow.id, emailBatch.fkFlowId))
    .where(eq(emailBatch.category, "result"))
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
    })
    .from(emailDelivery)
    .where(inArray(emailDelivery.fkEmailBatchId, batches.map((batch) => batch.id)))
    .orderBy(desc(emailDelivery.createdAt));

  const userMap = await listPeopleUsersByLinkIds([
    ...batches
      .map((batch) => batch.createdById)
      .filter((id): id is number => id !== null),
    ...deliveries.map((delivery) => delivery.userId),
  ]);

  return batches.map((batch) => {
    const batchDeliveries = deliveries
      .filter((item) => item.batchId === batch.id)
      .map((item) => ({
        ...item,
        userName: userMap.get(item.userId)?.name ?? "未知用户",
        studentId: userMap.get(item.userId)?.studentId ?? null,
      }));
    return {
      ...batch,
      createdByName: batch.createdById
        ? userMap.get(batch.createdById)?.name ?? null
        : null,
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

export async function listEmailDeliveries() {
  await verifyRole(3);

  const deliveries = await db
    .select({
      id: emailDelivery.id,
      category: emailDelivery.category,
      templateKey: emailDelivery.templateKey,
      subject: emailDelivery.subject,
      toAddress: emailDelivery.toAddress,
      status: emailDelivery.status,
      errorMessage: emailDelivery.errorMessage,
      sentAt: emailDelivery.sentAt,
      createdAt: emailDelivery.createdAt,
      htmlSnapshot: emailDelivery.htmlSnapshot,
      userId: emailDelivery.fkUserId,
      userFlowId: emailDelivery.fkUserFlowId,
      batchId: emailDelivery.fkEmailBatchId,
      relatedScheduleId: emailDelivery.relatedScheduleId,
      createdById: emailDelivery.createdBy,
      batchName: emailBatch.name,
      flowTitle: flow.title,
    })
    .from(emailDelivery)
    .leftJoin(emailBatch, eq(emailBatch.id, emailDelivery.fkEmailBatchId))
    .leftJoin(flow, eq(flow.id, emailBatch.fkFlowId))
    .orderBy(desc(emailDelivery.createdAt))
    .limit(50);

  if (deliveries.length === 0) {
    return [];
  }

  const userMap = await listPeopleUsersByLinkIds([
    ...deliveries.map((delivery) => delivery.userId),
    ...deliveries
      .map((delivery) => delivery.createdById)
      .filter((id): id is number => id !== null),
  ]);

  return deliveries.map((delivery) => ({
    ...delivery,
    userName: userMap.get(delivery.userId)?.name ?? "未知用户",
    studentId: userMap.get(delivery.userId)?.studentId ?? null,
    createdByName: delivery.createdById
      ? userMap.get(delivery.createdById)?.name ?? null
      : null,
  }));
}
