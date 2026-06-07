import "server-only";

import { db } from "@/db/drizzle";
import { operationAudit, user as userTable } from "@/db/schema";
import { verifyRole } from "@/lib/dal";
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

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;

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

function buildWhereConditions({
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
    const actorConditions: SQL<unknown>[] = [
      ilike(userTable.name, `%${actor}%`),
      ilike(userTable.studentId, `%${actor}%`),
    ];
    const actorId = Number(actor);
    if (Number.isInteger(actorId) && actorId > 0) {
      actorConditions.push(eq(operationAudit.actorId, actorId));
    }
    conditions.push(or(...actorConditions)!);
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

export async function listOperationAudit(params: OperationAuditListParams) {
  await verifyRole(3);

  const normalized = normalizeOperationAuditListParams(params);
  const offset = (normalized.page - 1) * normalized.pageSize;
  const whereConditions = buildWhereConditions(normalized);

  const totalCountResult = await db
    .select({ count: count() })
    .from(operationAudit)
    .leftJoin(userTable, eq(operationAudit.actorId, userTable.id))
    .where(whereConditions)
    .execute();
  const totalCount = Number(totalCountResult[0]?.count) || 0;

  const logs = await db
    .select({
      id: operationAudit.id,
      actorId: operationAudit.actorId,
      actorName: userTable.name,
      actorStudentId: userTable.studentId,
      action: operationAudit.action,
      resourceType: operationAudit.resourceType,
      resourceId: operationAudit.resourceId,
      metadata: operationAudit.metadata,
      createdAt: operationAudit.createdAt,
    })
    .from(operationAudit)
    .leftJoin(userTable, eq(operationAudit.actorId, userTable.id))
    .where(whereConditions)
    .orderBy(desc(operationAudit.createdAt))
    .limit(normalized.pageSize)
    .offset(offset)
    .execute();

  return {
    filters: normalized,
    logs,
    totalCount,
    totalPages: Math.ceil(totalCount / normalized.pageSize),
  };
}
