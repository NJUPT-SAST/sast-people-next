import "server-only";

import { db } from "@/db/drizzle";
import {
  emailBatch,
  emailDelivery,
  flow,
  interviewEvaluation,
  interviewSchedule,
  operationAudit,
  userFlow,
} from "@/db/schema";
import { verifyRole } from "@/lib/dal";
import { listLinkUsers } from "@/lib/link/admin";
import { getLinkAdminAccessTokenFromSession } from "@/lib/link/session";
import { listPeopleUsersByLinkIds } from "@/lib/link/user-lookup";
import { logServerError } from "@/lib/server-error-log";
import {
  and,
  count,
  desc,
  eq,
  gte,
  inArray,
  lte,
  sql,
  type SQL,
} from "drizzle-orm";

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;
const LINK_ACTOR_SEARCH_PAGE_SIZE = 100;
const LINK_ACTOR_SEARCH_CONCURRENCY = 4;
const MAX_LINK_ACTOR_SEARCH_RESULTS = 1000;

export type OperationAuditListParams = {
  page?: string | number;
  pageSize?: string | number;
  actor?: string;
  action?: string;
  actionGroup?: string;
  resourceType?: string;
  from?: string;
  to?: string;
};

export type NormalizedOperationAuditListParams = {
  page: number;
  pageSize: number;
  actor: string;
  action: string;
  actionGroup: string;
  resourceType: string;
  from: string;
  to: string;
};

export const operationAuditActionGroups = {
  review: [
    "review.score.upsert",
    "review.score.batch_upsert",
  ],
  email: [
    "email.batch.create",
    "email.batch_send",
    "email.recover_stale",
    "email.delivery_retry",
    "email.test_send",
    "email.template.update",
    "email.template.reset",
  ],
  evaluation: [
    "evaluation.create",
    "evaluation.update_pending",
    "evaluation.reject_candidate",
    "evaluation.reopen_and_create",
    "evaluation.approve",
    "evaluation.reject",
    "evaluation.unapprove",
    "evaluation.reopen",
    "interview_schedule.create",
    "interview_schedule.update",
    "interview_schedule.cancel",
    "interview_schedule.meeting.ended",
    "interview_schedule.meeting.ended_manual",
    "interview_schedule.meeting_minute.generated",
  ],
  flow: [
    "flow.create",
    "flow.update",
    "flow.delete",
    "flow.duplicate",
    "flow.update_problems",
    "flow.update_steps",
  ],
  user: [
    "user.update_role",
    "user.ban",
    "user_flow.forward",
    "user_flow.finish",
    "user_flow.reject",
    "user_flow.reopen",
    "user_flow.backward",
    "user_flow.batch_update_step",
    "user_flow.batch_end",
    "user_flow.batch_set_outcome",
  ],
} as const;

function parsePositiveInt(value: string | number | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function normalizeOperationAuditListParams(
  params: OperationAuditListParams,
): NormalizedOperationAuditListParams {
  return {
    page: parsePositiveInt(params.page, 1),
    pageSize: Math.min(
      parsePositiveInt(params.pageSize, DEFAULT_PAGE_SIZE),
      MAX_PAGE_SIZE,
    ),
    actor: params.actor?.trim() ?? "",
    action: params.action?.trim() ?? "",
    actionGroup: params.actionGroup?.trim() ?? "",
    resourceType: params.resourceType?.trim() ?? "",
    from: params.from?.trim() ?? "",
    to: params.to?.trim() ?? "",
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

async function buildWhereConditions({
  actor,
  action,
  actionGroup,
  resourceType,
  from,
  to,
}: NormalizedOperationAuditListParams) {
  const conditions: SQL<unknown>[] = [];

  if (action) {
    conditions.push(eq(operationAudit.action, action));
  } else if (actionGroup in operationAuditActionGroups) {
    conditions.push(
      inArray(
        operationAudit.action,
        operationAuditActionGroups[
          actionGroup as keyof typeof operationAuditActionGroups
        ],
      ),
    );
  }

  if (resourceType) {
    conditions.push(eq(operationAudit.resourceType, resourceType));
  }

  if (actor) {
    const actorId = Number(actor);
    if (Number.isInteger(actorId) && actorId > 0) {
      conditions.push(eq(operationAudit.actorId, actorId));
    } else {
      const actorIds = await findLinkActorIds(actor);
      conditions.push(
        actorIds.length > 0
          ? inArray(operationAudit.actorId, actorIds)
          : sql`false`,
      );
    }
  }

  const fromDate = getDateStart(from);
  if (fromDate) {
    conditions.push(gte(operationAudit.createdAt, fromDate));
  }

  const toDate = getDateEnd(to);
  if (toDate) {
    conditions.push(lte(operationAudit.createdAt, toDate));
  }

  return conditions.length > 0 ? and(...conditions) : undefined;
}

const findLinkActorIds = async (keyword: string) => {
  const accessToken = await getLinkAdminAccessTokenFromSession();
  const firstPage = await listLinkUsers(accessToken, {
    page: 1,
    pageSize: LINK_ACTOR_SEARCH_PAGE_SIZE,
    keyword,
  });
  if (firstPage.total > MAX_LINK_ACTOR_SEARCH_RESULTS) {
    throw new Error("匹配的 Link 用户过多，请缩小姓名或学号筛选范围");
  }
  const totalPages = Math.ceil(firstPage.total / LINK_ACTOR_SEARCH_PAGE_SIZE);
  if (totalPages <= 1) return firstPage.users.map((item) => item.id);

  const remainingPages = [];
  for (
    let page = 2;
    page <= totalPages;
    page += LINK_ACTOR_SEARCH_CONCURRENCY
  ) {
    remainingPages.push(
      ...(await Promise.all(
        Array.from(
          { length: Math.min(LINK_ACTOR_SEARCH_CONCURRENCY, totalPages - page + 1) },
          (_, index) =>
            listLinkUsers(accessToken, {
              page: page + index,
              pageSize: LINK_ACTOR_SEARCH_PAGE_SIZE,
              keyword,
            }),
        ),
      )),
    );
  }
  return Array.from(new Set([firstPage, ...remainingPages].flatMap((page) =>
    page.users.map((item) => item.id),
  )));
};

export async function listOperationAudit(params: OperationAuditListParams) {
  await verifyRole(3);

  const normalized = normalizeOperationAuditListParams(params);
  const offset = (normalized.page - 1) * normalized.pageSize;
  const whereConditions = await buildWhereConditions(normalized);

  const [totalCountResult, rawLogs] = await Promise.all([
    db
      .select({ count: count() })
      .from(operationAudit)
      .where(whereConditions)
      .execute(),
    db
      .select({
        id: operationAudit.id,
        actorId: operationAudit.actorId,
        action: operationAudit.action,
        resourceType: operationAudit.resourceType,
        resourceId: operationAudit.resourceId,
        metadata: operationAudit.metadata,
        createdAt: operationAudit.createdAt,
      })
      .from(operationAudit)
      .where(whereConditions)
      .orderBy(desc(operationAudit.createdAt))
      .limit(normalized.pageSize)
      .offset(offset)
      .execute(),
  ]);
  const totalCount = Number(totalCountResult[0]?.count) || 0;

  const resourceIds = (resourceType: string) =>
    rawLogs
      .filter((log) => log.resourceType === resourceType && log.resourceId !== null)
      .map((log) => log.resourceId as number);
  const [flows, userFlows, emailBatches, emailDeliveries, evaluations, schedules] =
    await Promise.all([
      db
        .select({ id: flow.id, label: flow.title })
        .from(flow)
        .where(inArray(flow.id, resourceIds('flow'))),
      db
        .select({ id: userFlow.id, targetUserId: userFlow.fkUserId, flowTitle: flow.title })
        .from(userFlow)
        .innerJoin(flow, eq(userFlow.fkFlowId, flow.id))
        .where(inArray(userFlow.id, resourceIds('user_flow'))),
      db
        .select({ id: emailBatch.id, label: emailBatch.name, subject: emailBatch.subject })
        .from(emailBatch)
        .where(inArray(emailBatch.id, resourceIds('email_batch'))),
      db
        .select({ id: emailDelivery.id, label: emailDelivery.toAddress, subject: emailDelivery.subject, targetUserId: emailDelivery.fkUserId })
        .from(emailDelivery)
        .where(inArray(emailDelivery.id, resourceIds('email_delivery'))),
      db
        .select({ id: interviewEvaluation.id, targetUserId: userFlow.fkUserId, flowTitle: flow.title })
        .from(interviewEvaluation)
        .innerJoin(userFlow, eq(interviewEvaluation.fkUserFlowId, userFlow.id))
        .innerJoin(flow, eq(userFlow.fkFlowId, flow.id))
        .where(inArray(interviewEvaluation.id, resourceIds('interview_evaluation'))),
      db
        .select({ id: interviewSchedule.id, targetUserId: userFlow.fkUserId, label: interviewSchedule.summary })
        .from(interviewSchedule)
        .innerJoin(userFlow, eq(interviewSchedule.fkUserFlowId, userFlow.id))
        .where(inArray(interviewSchedule.id, resourceIds('interview_schedule'))),
    ]);
  const resourceLabelByKey = new Map<string, string>();
  const resourceTargetUserIdByKey = new Map<string, number>();
  flows.forEach((item) => resourceLabelByKey.set(`flow:${item.id}`, `流程：${item.label}`));
  userFlows.forEach((item) => {
    resourceLabelByKey.set(`user_flow:${item.id}`, `考生流程：${item.flowTitle}`);
    resourceTargetUserIdByKey.set(`user_flow:${item.id}`, item.targetUserId);
  });
  emailBatches.forEach((item) =>
    resourceLabelByKey.set(`email_batch:${item.id}`, `邮件批次：${item.label ?? item.subject}`),
  );
  emailDeliveries.forEach((item) => {
    resourceLabelByKey.set(`email_delivery:${item.id}`, `邮件投递：${item.label}`);
    if (item.targetUserId) resourceTargetUserIdByKey.set(`email_delivery:${item.id}`, item.targetUserId);
  });
  evaluations.forEach((item) => {
    resourceLabelByKey.set(`interview_evaluation:${item.id}`, `面评：${item.flowTitle}`);
    resourceTargetUserIdByKey.set(`interview_evaluation:${item.id}`, item.targetUserId);
  });
  schedules.forEach((item) => {
    resourceLabelByKey.set(`interview_schedule:${item.id}`, `面试：${item.label}`);
    resourceTargetUserIdByKey.set(`interview_schedule:${item.id}`, item.targetUserId);
  });
  const targetUserIds = rawLogs.flatMap((log) => {
    const metadata = log.metadata as Record<string, unknown> | null;
    const resourceTargetUserId =
      log.resourceType === 'link_user' ? log.resourceId : undefined;
    const targetUserId =
      typeof metadata?.targetUserId === 'number'
        ? metadata.targetUserId
        : typeof metadata?.userId === 'number'
          ? metadata.userId
          : resourceTargetUserId ?? resourceTargetUserIdByKey.get(`${log.resourceType}:${log.resourceId}`);
    const targetUserIds = metadata?.targetUserIds;

    return [
      ...(typeof targetUserId === 'number' ? [targetUserId] : []),
      ...(Array.isArray(targetUserIds)
        ? targetUserIds.filter((id): id is number => typeof id === 'number')
        : []),
    ];
  });
  let peopleMap: Awaited<ReturnType<typeof listPeopleUsersByLinkIds>> = new Map();
  try {
    peopleMap = await listPeopleUsersByLinkIds([
      ...rawLogs.map((log) => log.actorId),
      ...targetUserIds,
    ]);
  } catch (error) {
    logServerError("operation-audit:people-lookup", error, {
      action: "list-operation-audit-people",
      metadata: { logCount: rawLogs.length, targetUserCount: targetUserIds.length },
    });
  }
  const logs = rawLogs.map((log) => {
    const metadata = log.metadata as Record<string, unknown> | null;
    const resourceKey = `${log.resourceType}:${log.resourceId}`;
    const targetUserId =
      typeof metadata?.targetUserId === 'number'
        ? metadata.targetUserId
        : typeof metadata?.userId === 'number'
          ? metadata.userId
          : log.resourceType === 'link_user'
            ? log.resourceId
            : resourceTargetUserIdByKey.get(resourceKey);
    const targetUserIds = metadata?.targetUserIds;

    return {
      ...log,
      actorName: peopleMap.get(log.actorId)?.name ?? null,
      actorStudentId: peopleMap.get(log.actorId)?.studentId ?? null,
      resourceLabel: resourceLabelByKey.get(resourceKey) ?? null,
      targetUser:
        typeof targetUserId === 'number'
          ? {
              id: targetUserId,
              name: peopleMap.get(targetUserId)?.name ?? null,
              studentId: peopleMap.get(targetUserId)?.studentId ?? null,
            }
          : null,
      targetUsers: Array.isArray(targetUserIds)
        ? targetUserIds
            .filter((id): id is number => typeof id === 'number')
            .map((id) => ({
              id,
              name: peopleMap.get(id)?.name ?? null,
              studentId: peopleMap.get(id)?.studentId ?? null,
            }))
        : [],
    };
  });

  return {
    filters: normalized,
    logs,
    totalCount,
    totalPages: Math.ceil(totalCount / normalized.pageSize),
  };
}
