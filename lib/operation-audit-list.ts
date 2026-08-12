import "server-only";

import { db } from "@/db/drizzle";
import { operationAudit } from "@/db/schema";
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
    "evaluation.reopen",
    "interview_schedule.create",
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

  let actorMap: Awaited<ReturnType<typeof listPeopleUsersByLinkIds>> = new Map();
  try {
    actorMap = await listPeopleUsersByLinkIds(rawLogs.map((log) => log.actorId));
  } catch (error) {
    logServerError("operation-audit:actor-lookup", error, {
      action: "list-operation-audit-actors",
      metadata: { actorCount: rawLogs.length },
    });
  }
  const logs = rawLogs.map((log) => ({
    ...log,
    actorName: actorMap.get(log.actorId)?.name ?? null,
    actorStudentId: actorMap.get(log.actorId)?.studentId ?? null,
  }));

  return {
    filters: normalized,
    logs,
    totalCount,
    totalPages: Math.ceil(totalCount / normalized.pageSize),
  };
}
