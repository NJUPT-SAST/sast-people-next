"use server";

import { db } from "@/db/drizzle";
import { emailBatch, emailDelivery, emailDeliveryAttempt, flow } from "@/db/schema";
import { verifyRole } from "@/lib/dal";
import { listPeopleUsersByLinkIds } from "@/lib/link/user-lookup";
import {
  and,
  count,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  lte,
  or,
  type SQL,
} from "drizzle-orm";

const DEFAULT_DELIVERY_PAGE_SIZE = 20;
const MAX_DELIVERY_PAGE_SIZE = 50;
const deliveryStatuses = ["pending", "sending", "sent", "failed", "dead"] as const;
type DeliveryStatus = (typeof deliveryStatuses)[number];
const MAX_DELIVERY_ATTEMPTS_PER_RECORD = 5;

export type EmailDeliveryListParams = {
  page?: string | number;
  pageSize?: string | number;
  category?: string;
  status?: string;
  templateKey?: string;
  flowId?: string | number;
  creatorId?: string | number;
  from?: string;
  to?: string;
  query?: string;
};

export type NormalizedEmailDeliveryListParams = {
  page: number;
  pageSize: number;
  category: string;
  status: string;
  templateKey: string;
  flowId: string;
  creatorId: string;
  from: string;
  to: string;
  query: string;
};

function parsePositiveInt(value: string | number | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeEmailDeliveryListParams(
  params: EmailDeliveryListParams = {},
): NormalizedEmailDeliveryListParams {
  return {
    page: parsePositiveInt(params.page, 1),
    pageSize: Math.min(
      parsePositiveInt(params.pageSize, DEFAULT_DELIVERY_PAGE_SIZE),
      MAX_DELIVERY_PAGE_SIZE,
    ),
    category: params.category?.toString().trim() ?? "",
    status: params.status?.toString().trim() ?? "",
    templateKey: params.templateKey?.toString().trim() ?? "",
    flowId: params.flowId?.toString().trim() ?? "",
    creatorId: params.creatorId?.toString().trim() ?? "",
    from: params.from?.trim() ?? "",
    to: params.to?.trim() ?? "",
    query: params.query?.trim() ?? "",
  };
}

function getDateStart(value: string) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getDateEnd(value: string) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  date.setHours(23, 59, 59, 999);
  return date;
}

function buildEmailDeliveryWhereConditions({
  category,
  status,
  templateKey,
  flowId,
  creatorId,
  from,
  to,
  query,
}: NormalizedEmailDeliveryListParams) {
  const conditions: SQL<unknown>[] = [];

  if (category) conditions.push(eq(emailDelivery.category, category));
  if (deliveryStatuses.includes(status as DeliveryStatus)) {
    conditions.push(eq(emailDelivery.status, status as DeliveryStatus));
  }
  if (templateKey) conditions.push(eq(emailDelivery.templateKey, templateKey));

  const flowIdValue = Number(flowId);
  if (Number.isInteger(flowIdValue) && flowIdValue > 0) {
    conditions.push(eq(emailDelivery.fkFlowId, flowIdValue));
  }

  const creatorIdValue = Number(creatorId);
  if (Number.isInteger(creatorIdValue) && creatorIdValue > 0) {
    conditions.push(eq(emailDelivery.createdBy, creatorIdValue));
  }

  const fromDate = getDateStart(from);
  if (fromDate) conditions.push(gte(emailDelivery.createdAt, fromDate));

  const toDate = getDateEnd(to);
  if (toDate) conditions.push(lte(emailDelivery.createdAt, toDate));

  if (query) {
    const pattern = `%${query}%`;
    conditions.push(
      or(
        ilike(emailDelivery.subject, pattern),
        ilike(emailDelivery.toAddress, pattern),
        ilike(emailDelivery.templateKey, pattern),
        ilike(emailDelivery.errorMessage, pattern),
        ilike(flow.title, pattern),
        ilike(emailBatch.name, pattern),
      )!,
    );
  }

  return conditions.length > 0 ? and(...conditions) : undefined;
}

function groupRecentAttemptsByDelivery(
  attempts: Array<{
    id: number;
    deliveryId: number;
    trigger: string;
    provider: string;
    status: string;
    providerMessageId: string | null;
    errorMessage: string | null;
    triggeredBy: number | null;
    startedAt: Date;
    finishedAt: Date | null;
    durationMs: number | null;
  }>,
) {
  const attemptMap = new Map<number, typeof attempts>();

  for (const attempt of attempts) {
    const deliveryAttempts = attemptMap.get(attempt.deliveryId) ?? [];
    if (deliveryAttempts.length < MAX_DELIVERY_ATTEMPTS_PER_RECORD) {
      deliveryAttempts.push(attempt);
      attemptMap.set(attempt.deliveryId, deliveryAttempts);
    }
  }

  return attemptMap;
}

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
      attemptCount: emailDelivery.attemptCount,
      lastAttemptAt: emailDelivery.lastAttemptAt,
      nextRetryAt: emailDelivery.nextRetryAt,
      deadLetteredAt: emailDelivery.deadLetteredAt,
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
    ...deliveries
      .map((delivery) => delivery.userId)
      .filter((id): id is number => id !== null),
  ]);

  return batches.map((batch) => {
    const batchDeliveries = deliveries
      .filter((item) => item.batchId === batch.id)
      .map((item) => ({
        ...item,
        userName: item.userId
          ? userMap.get(item.userId)?.name ?? "未知用户"
          : "外部/测试收件人",
        studentId: item.userId ? userMap.get(item.userId)?.studentId ?? null : null,
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
        dead: batchDeliveries.filter((item) => item.status === "dead").length,
      },
    };
  });
}

export async function listEmailDeliveryPage(params: EmailDeliveryListParams = {}) {
  await verifyRole(3);

  const filters = normalizeEmailDeliveryListParams(params);
  const whereConditions = buildEmailDeliveryWhereConditions(filters);

  const totalCountResult = await db
    .select({ value: count() })
    .from(emailDelivery)
    .leftJoin(emailBatch, eq(emailBatch.id, emailDelivery.fkEmailBatchId))
    .leftJoin(flow, eq(flow.id, emailDelivery.fkFlowId))
    .where(whereConditions);
  const totalCount = Number(totalCountResult[0]?.value) || 0;
  const totalPages = Math.ceil(totalCount / filters.pageSize);
  const currentPage = totalPages > 0 ? Math.min(filters.page, totalPages) : 1;
  const resolvedFilters = {
    ...filters,
    page: currentPage,
  };
  const offset = (currentPage - 1) * filters.pageSize;

  const deliveries = await db
    .select({
      id: emailDelivery.id,
      category: emailDelivery.category,
      templateKey: emailDelivery.templateKey,
      subject: emailDelivery.subject,
      toAddress: emailDelivery.toAddress,
      status: emailDelivery.status,
      errorMessage: emailDelivery.errorMessage,
      attemptCount: emailDelivery.attemptCount,
      lastAttemptAt: emailDelivery.lastAttemptAt,
      nextRetryAt: emailDelivery.nextRetryAt,
      deadLetteredAt: emailDelivery.deadLetteredAt,
      sentAt: emailDelivery.sentAt,
      createdAt: emailDelivery.createdAt,
      htmlSnapshot: emailDelivery.htmlSnapshot,
      userId: emailDelivery.fkUserId,
      flowId: emailDelivery.fkFlowId,
      userFlowId: emailDelivery.fkUserFlowId,
      batchId: emailDelivery.fkEmailBatchId,
      relatedScheduleId: emailDelivery.relatedScheduleId,
      createdById: emailDelivery.createdBy,
      batchName: emailBatch.name,
      flowTitle: flow.title,
    })
    .from(emailDelivery)
    .leftJoin(emailBatch, eq(emailBatch.id, emailDelivery.fkEmailBatchId))
    .leftJoin(flow, eq(flow.id, emailDelivery.fkFlowId))
    .where(whereConditions)
    .orderBy(desc(emailDelivery.createdAt))
    .limit(filters.pageSize)
    .offset(offset);

  if (deliveries.length === 0) {
    return {
      deliveries: [],
      filters: resolvedFilters,
      totalCount,
      totalPages,
    };
  }

  const userMap = await listPeopleUsersByLinkIds([
    ...deliveries
      .map((delivery) => delivery.userId)
      .filter((id): id is number => id !== null),
    ...deliveries
      .map((delivery) => delivery.createdById)
      .filter((id): id is number => id !== null),
  ]);
  const attempts = await db
    .select({
      id: emailDeliveryAttempt.id,
      deliveryId: emailDeliveryAttempt.fkEmailDeliveryId,
      trigger: emailDeliveryAttempt.trigger,
      provider: emailDeliveryAttempt.provider,
      status: emailDeliveryAttempt.status,
      providerMessageId: emailDeliveryAttempt.providerMessageId,
      errorMessage: emailDeliveryAttempt.errorMessage,
      triggeredBy: emailDeliveryAttempt.triggeredBy,
      startedAt: emailDeliveryAttempt.startedAt,
      finishedAt: emailDeliveryAttempt.finishedAt,
      durationMs: emailDeliveryAttempt.durationMs,
    })
    .from(emailDeliveryAttempt)
    .where(inArray(emailDeliveryAttempt.fkEmailDeliveryId, deliveries.map((delivery) => delivery.id)))
    .orderBy(desc(emailDeliveryAttempt.startedAt));
  const attemptMap = groupRecentAttemptsByDelivery(attempts);

  return {
    deliveries: deliveries.map((delivery) => ({
      ...delivery,
      attempts: attemptMap.get(delivery.id) ?? [],
      userName: delivery.userId
        ? userMap.get(delivery.userId)?.name ?? "未知用户"
        : "外部/测试收件人",
      studentId: delivery.userId
        ? userMap.get(delivery.userId)?.studentId ?? null
        : null,
      createdByName: delivery.createdById
        ? userMap.get(delivery.createdById)?.name ?? null
        : null,
    })),
    filters: resolvedFilters,
    totalCount,
    totalPages,
  };
}

export async function listEmailDeliveries() {
  const page = await listEmailDeliveryPage({ pageSize: 50 });
  return page.deliveries;
}
