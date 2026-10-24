import "server-only";

import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db/drizzle";
import {
  collectionForm,
  collectionInvitation,
  collectionSubmission,
  flow,
  userFlow,
} from "@/db/schema";
import { flowTypeLabel } from "@/const/flow";
import type { CollectionFlowOption } from "@/const/collection";
import { canFillCollectionForm } from "@/lib/collection-access";
import { collectionFormPhase } from "@/lib/collection-status";
import { MANAGER_ROLE } from "@/lib/link/role";
import type { VerifiedSession } from "@/lib/dal";

/** 当前用户最终通过的流程 ID（用于「仅流程通过者可填」）。 */
export const getPassedFlowIds = async (userId: number): Promise<number[]> => {
  const rows = await db
    .selectDistinct({ flowId: userFlow.fkFlowId })
    .from(userFlow)
    .where(
      and(
        eq(userFlow.fkUserId, userId),
        eq(userFlow.progressStatus, "passed"),
      ),
    );
  return rows.map((row) => row.flowId);
};

/** 批量查询一组用户最终通过的流程 ID。 */
export const getPassedFlowIdsByUserIds = async (
  userIds: number[],
): Promise<Map<number, number[]>> => {
  const result = new Map<number, number[]>();
  if (userIds.length === 0) return result;

  const rows = await db
    .selectDistinct({
      userId: userFlow.fkUserId,
      flowId: userFlow.fkFlowId,
    })
    .from(userFlow)
    .where(
      and(
        inArray(userFlow.fkUserId, userIds),
        eq(userFlow.progressStatus, "passed"),
      ),
    );

  for (const row of rows) {
    const flows = result.get(row.userId) ?? [];
    flows.push(row.flowId);
    result.set(row.userId, flows);
  }
  return result;
};

/** 已提交过某张收集表的用户 ID（邀请时排除）。 */
export const getFormSubmittedUserIds = async (
  formId: number,
  userIds: number[],
): Promise<Set<number>> => {
  if (userIds.length === 0) return new Set();
  const rows = await db
    .select({ userId: collectionSubmission.fkUserId })
    .from(collectionSubmission)
    .where(
      and(
        eq(collectionSubmission.fkFormId, formId),
        inArray(collectionSubmission.fkUserId, userIds),
      ),
    );
  return new Set(rows.map((row) => row.userId));
};

/** 收集表邀请统计。 */
export type CollectionInvitationStats = {
  total: number;
  sent: number;
  failed: number;
  pending: number;
};

export const getCollectionInvitationStats = async (
  formId: number,
): Promise<CollectionInvitationStats> => {
  const rows = await db
    .select({
      status: collectionInvitation.status,
      count: sql<number>`count(*)::int`.mapWith(Number),
    })
    .from(collectionInvitation)
    .where(eq(collectionInvitation.fkFormId, formId))
    .groupBy(collectionInvitation.status);

  const stats: CollectionInvitationStats = {
    total: 0,
    sent: 0,
    failed: 0,
    pending: 0,
  };

  for (const row of rows) {
    stats.total += row.count;
    if (row.status === "sent") stats.sent += row.count;
    else if (row.status === "failed") stats.failed += row.count;
    else stats.pending += row.count;
  }

  return stats;
};

/** 可选流程列表：仅未删除流程，标签为「部门/阶段 · 标题」。 */
export const listCollectionFlowOptions = async (): Promise<
  CollectionFlowOption[]
> => {
  const rows = await db
    .select({
      id: flow.id,
      title: flow.title,
      type: flow.type,
      department: flow.department,
    })
    .from(flow)
    .where(eq(flow.isDeleted, false))
    .orderBy(desc(flow.createdAt));

  return rows.map((row) => ({
    id: row.id,
    label: `${flowTypeLabel(row.type, row.department)} · ${row.title}`,
  }));
};

/** 收集表列表：部长/管理员看全部；其他账号按身份与流程条件过滤。 */
export const listVisibleCollectionForms = async (session: VerifiedSession) => {
  const rows = await db
    .select({
      id: collectionForm.id,
      title: collectionForm.title,
      kind: collectionForm.kind,
      templateName: collectionForm.templateName,
      instructions: collectionForm.instructions,
      status: collectionForm.status,
      startsAt: collectionForm.startsAt,
      deadline: collectionForm.deadline,
      allowedRoles: collectionForm.allowedRoles,
      allowedFlowIds: collectionForm.allowedFlowIds,
      createdAt: collectionForm.createdAt,
      submissionId: collectionSubmission.id,
      submissionUpdatedAt: collectionSubmission.updatedAt,
      submissionReturnedAt: collectionSubmission.returnedAt,
      submissionCount: sql<number>`(
        select count(*)::int from ${collectionSubmission}
        where ${collectionSubmission.fkFormId} = ${collectionForm.id}
      )`.mapWith(Number),
    })
    .from(collectionForm)
    .leftJoin(
      collectionSubmission,
      and(
        eq(collectionSubmission.fkFormId, collectionForm.id),
        eq(collectionSubmission.fkUserId, session.uid),
      ),
    )
    .orderBy(
      sql`case when ${collectionForm.status} = 'open' then 0 else 1 end`,
      desc(collectionForm.createdAt),
    );

  if (session.role >= MANAGER_ROLE) return rows;
  const passedFlowIds = await getPassedFlowIds(session.uid);
  return rows.filter((row) => {
    if (row.submissionId !== null) return true;
    /* 讲师及以下：未到开始时间或已结束的表不再出现在列表里 */
    return (
      collectionFormPhase(row) === "open" &&
      canFillCollectionForm(session, row, passedFlowIds)
    );
  });
};

export const getCollectionFormById = async (formId: number) => {
  const [form] = await db
    .select()
    .from(collectionForm)
    .where(eq(collectionForm.id, formId))
    .limit(1);
  return form ?? null;
};

export const getCollectionFormByShareToken = async (token: string) => {
  const [form] = await db
    .select()
    .from(collectionForm)
    .where(eq(collectionForm.shareToken, token))
    .limit(1);
  return form ?? null;
};

export const getCollectionSubmission = async (formId: number, userId: number) => {
  const [submission] = await db
    .select()
    .from(collectionSubmission)
    .where(
      and(
        eq(collectionSubmission.fkFormId, formId),
        eq(collectionSubmission.fkUserId, userId),
      ),
    )
    .limit(1);
  return submission ?? null;
};

export const getCollectionSubmissionById = async (
  formId: number,
  submissionId: number,
) => {
  const [submission] = await db
    .select()
    .from(collectionSubmission)
    .where(
      and(
        eq(collectionSubmission.fkFormId, formId),
        eq(collectionSubmission.id, submissionId),
      ),
    )
    .limit(1);
  return submission ?? null;
};

export const listCollectionSubmissions = async (formId: number) =>
  db
    .select()
    .from(collectionSubmission)
    .where(eq(collectionSubmission.fkFormId, formId))
    .orderBy(desc(collectionSubmission.updatedAt));
