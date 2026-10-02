"use server";

import { db } from "@/db/drizzle";
import { getBeijingDayRange, parseBeijingDateOnly } from "@/lib/timezone";
import {
  emailBatch,
  emailDelivery,
  emailDeliveryAttempt,
  flow,
  userFlow,
} from "@/db/schema";
import { verifyRole } from "@/lib/dal";
import { getDepartmentScope, type DepartmentScope } from "@/lib/authz";
import {
  scopedResolvedFlowIdCondition,
  strictlyVisibleFlowPredicate,
} from "@/lib/flow-access";
import {
  findPeopleUserIdsByKeyword,
  listPeopleUsersByLinkIds,
} from "@/lib/link/user-lookup";
import {
  and,
  count,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  isNotNull,
  lt,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

const DEFAULT_DELIVERY_PAGE_SIZE = 20;
const MAX_DELIVERY_PAGE_SIZE = 50;
const deliveryStatuses = ["pending", "sending", "sent", "failed", "dead"] as const;
type DeliveryStatus = (typeof deliveryStatuses)[number];
const MAX_DELIVERY_ATTEMPTS_PER_RECORD = 5;

/* 老投递可能把流程记在批次上，用别名 join 出批次流程以解析实际归属 */
const batchFlow = alias(flow, "batch_flow");

/**
 * 邮件按批次 / 投递所属流程的部门隔离：
 * 投递自身未记录流程时回退到批次的流程；严格按流程归属部门判定，
 * 全局流程（department IS NULL）的历史数据仅管理员可见，与重试写路径口径一致。
 */
const scopedDeliveryFlowCondition = (scope: DepartmentScope) =>
  scopedResolvedFlowIdCondition(
    scope,
    sql`coalesce(${emailDelivery.fkFlowId}, ${emailBatch.fkFlowId})`,
  );

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
  return parseBeijingDateOnly(value);
}

function getDateEnd(value: string) {
  if (!value) return null;
  const start = parseBeijingDateOnly(value);
  return start ? new Date(start.getTime() + 24 * 60 * 60 * 1000) : null;
}

async function buildEmailDeliveryWhereConditions(
  {
    category,
    status,
    templateKey,
    flowId,
    creatorId,
    from,
    to,
    query,
  }: NormalizedEmailDeliveryListParams,
  scope: DepartmentScope,
) {
  const conditions: SQL<unknown>[] = [];

  const scopedFlowCondition = scopedDeliveryFlowCondition(scope);
  if (scopedFlowCondition) {
    conditions.push(scopedFlowCondition);
  }

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
  if (toDate) conditions.push(lt(emailDelivery.createdAt, toDate));

  if (query) {
    const pattern = `%${query}%`;
    let matchedUserIds: number[] = [];
    try {
      matchedUserIds = await findPeopleUserIdsByKeyword(query);
    } catch {
      // Keep database-backed search available when Link is temporarily unavailable.
      matchedUserIds = [];
    }
    const queryConditions: SQL<unknown>[] = [
      ilike(emailDelivery.subject, pattern),
      ilike(emailDelivery.toAddress, pattern),
      ilike(emailDelivery.templateKey, pattern),
      ilike(emailDelivery.errorMessage, pattern),
      ilike(flow.title, pattern),
      ilike(emailBatch.name, pattern),
    ];
    if (matchedUserIds.length > 0) {
      queryConditions.push(inArray(emailDelivery.fkUserId, matchedUserIds));
    }
    conditions.push(
      or(...queryConditions)!,
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
  const scope = await getDepartmentScope();

  const batches = await db
    .select({
      id: emailBatch.id,
      templateKey: emailBatch.templateKey,
      subject: emailBatch.subject,
      accept: emailBatch.accept,
      status: emailBatch.status,
      totalCount: emailBatch.totalCount,
      flowId: emailBatch.fkFlowId,
      department: flow.department,
      createdAt: emailBatch.createdAt,
      updatedAt: emailBatch.updatedAt,
      flowTitle: flow.title,
      createdById: emailBatch.fkCreatedBy,
    })
    .from(emailBatch)
    .innerJoin(flow, eq(flow.id, emailBatch.fkFlowId))
    .where(and(eq(emailBatch.category, "result"), strictlyVisibleFlowPredicate(scope)))
    .orderBy(desc(emailBatch.createdAt))
    .limit(20);

  if (batches.length === 0) {
    return [];
  }

  const deliverySummaries = await db
    .select({
      batchId: emailDelivery.fkEmailBatchId,
      pending: sql<number>`count(*) filter (where ${emailDelivery.status} = 'pending')`,
      sending: sql<number>`count(*) filter (where ${emailDelivery.status} = 'sending')`,
      sent: sql<number>`count(*) filter (where ${emailDelivery.status} = 'sent')`,
      failed: sql<number>`count(*) filter (where ${emailDelivery.status} = 'failed')`,
      dead: sql<number>`count(*) filter (where ${emailDelivery.status} = 'dead')`,
    })
    .from(emailDelivery)
    .where(inArray(emailDelivery.fkEmailBatchId, batches.map((batch) => batch.id)))
    .groupBy(emailDelivery.fkEmailBatchId);
  const summaryByBatchId = new Map(
    deliverySummaries.map((summary) => [summary.batchId, summary]),
  );

  return batches.map((batch) => {
    const summary = summaryByBatchId.get(batch.id);
    return {
      ...batch,
      createdByName: null,
      counts: {
        pending: Number(summary?.pending ?? 0),
        sending: Number(summary?.sending ?? 0),
        sent: Number(summary?.sent ?? 0),
        failed: Number(summary?.failed ?? 0),
        dead: Number(summary?.dead ?? 0),
      },
    };
  });
}

export async function listEmailDeliveryPage(params: EmailDeliveryListParams = {}) {
  await verifyRole(3);
  const scope = await getDepartmentScope();

  const filters = normalizeEmailDeliveryListParams(params);
  const whereConditions = await buildEmailDeliveryWhereConditions(filters, scope);

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
      flowDepartment: sql<string | null>`coalesce(${flow.department}, ${batchFlow.department})`,
    })
    .from(emailDelivery)
    .leftJoin(emailBatch, eq(emailBatch.id, emailDelivery.fkEmailBatchId))
    .leftJoin(flow, eq(flow.id, emailDelivery.fkFlowId))
    .leftJoin(batchFlow, eq(batchFlow.id, emailBatch.fkFlowId))
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

export async function listResultEmailDeliveryStates() {
  await verifyRole(3);
  const scope = await getDepartmentScope();

  // Older deliveries may predate fk_user_flow_id, or keep their flow and
  // result type on the delivery rather than the batch. Resolve those fields
  // before aggregating so historical successful emails are never re-offered.
  const resultFlowId = sql<number>`coalesce(${emailDelivery.fkFlowId}, ${emailBatch.fkFlowId})`;
  const resultAccept = sql<boolean>`case coalesce(${emailDelivery.metadata}->>'accept', ${emailBatch.accept}::text) when 'true' then true when 'false' then false else null end`;
  const resultUserFlowId = sql<number>`coalesce(${emailDelivery.fkUserFlowId}, ${userFlow.id})`;

  return db
    .select({
      flowId: resultFlowId,
      userFlowId: resultUserFlowId,
      accept: resultAccept,
      hasSent: sql<boolean>`bool_or(${emailDelivery.status} = 'sent')`,
      hasSending: sql<boolean>`bool_or(${emailDelivery.status} = 'sending')`,
      hasQueueable: sql<boolean>`bool_or(${emailDelivery.status} in ('pending', 'failed', 'dead'))`,
    })
    .from(emailDelivery)
    .innerJoin(emailBatch, eq(emailBatch.id, emailDelivery.fkEmailBatchId))
    .leftJoin(
      userFlow,
      and(
        eq(userFlow.fkFlowId, resultFlowId),
        eq(userFlow.fkUserId, emailDelivery.fkUserId),
      ),
    )
    .where(
      and(
        eq(emailDelivery.category, "result"),
        isNotNull(resultFlowId),
        isNotNull(resultUserFlowId),
        isNotNull(resultAccept),
        scopedDeliveryFlowCondition(scope),
      ),
    )
    .groupBy(
      resultFlowId,
      resultUserFlowId,
      resultAccept,
    );
}

export async function getEmailStatusOverview() {
  await verifyRole(3);
  const scope = await getDepartmentScope();
  const scopedCondition = scopedDeliveryFlowCondition(scope);

  const { start: todayStart, end: todayEnd } = getBeijingDayRange();
  const [todaySent, todayFailed, pendingOrSending, recentFailures] =
    await Promise.all([
      db
        .select({ value: count() })
        .from(emailDelivery)
        .leftJoin(emailBatch, eq(emailBatch.id, emailDelivery.fkEmailBatchId))
        .where(
          and(
            eq(emailDelivery.status, "sent"),
            gte(emailDelivery.sentAt, todayStart),
            lt(emailDelivery.sentAt, todayEnd),
            scopedCondition,
          ),
        ),
      db
        .select({ value: count() })
        .from(emailDelivery)
        .leftJoin(emailBatch, eq(emailBatch.id, emailDelivery.fkEmailBatchId))
        .where(
          and(
            or(
              and(
                eq(emailDelivery.status, "failed"),
                gte(emailDelivery.lastAttemptAt, todayStart),
                lt(emailDelivery.lastAttemptAt, todayEnd),
              ),
              and(
                eq(emailDelivery.status, "dead"),
                gte(emailDelivery.deadLetteredAt, todayStart),
                lt(emailDelivery.deadLetteredAt, todayEnd),
              ),
            ),
            scopedCondition,
          ),
        ),
      db
        .select({ value: count() })
        .from(emailDelivery)
        .leftJoin(emailBatch, eq(emailBatch.id, emailDelivery.fkEmailBatchId))
        .where(
          and(
            inArray(emailDelivery.status, ["pending", "sending"]),
            scopedCondition,
          ),
        ),
      db
        .select({
          id: emailDelivery.id,
          subject: emailDelivery.subject,
          toAddress: emailDelivery.toAddress,
          status: emailDelivery.status,
          errorMessage: emailDelivery.errorMessage,
        })
        .from(emailDelivery)
        .leftJoin(emailBatch, eq(emailBatch.id, emailDelivery.fkEmailBatchId))
        .where(
          and(
            inArray(emailDelivery.status, ["failed", "dead"]),
            scopedCondition,
          ),
        )
        .orderBy(desc(emailDelivery.createdAt))
        .limit(5),
    ]);

  return {
    todaySentCount: Number(todaySent[0]?.value) || 0,
    todayFailedCount: Number(todayFailed[0]?.value) || 0,
    pendingOrSendingCount: Number(pendingOrSending[0]?.value) || 0,
    recentFailures,
  };
}
