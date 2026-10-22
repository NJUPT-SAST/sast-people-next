import "server-only";

import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { collectionForm, collectionSubmission } from "@/db/schema";
import { MANAGER_ROLE } from "@/lib/link/role";
import type { VerifiedSession } from "@/lib/dal";

/** 收集表列表：部长/管理员看全部；其他账号按表单允许的身份过滤。 */
export const listVisibleCollectionForms = async (session: VerifiedSession) => {
  const rows = await db
    .select({
      id: collectionForm.id,
      title: collectionForm.title,
      instructions: collectionForm.instructions,
      status: collectionForm.status,
      startsAt: collectionForm.startsAt,
      deadline: collectionForm.deadline,
      allowedRoles: collectionForm.allowedRoles,
      createdAt: collectionForm.createdAt,
      submissionId: collectionSubmission.id,
      submissionUpdatedAt: collectionSubmission.updatedAt,
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

  /* 部长/管理员看全部；其他账号只看身份允许的、或自己填过的表 */
  return session.role >= MANAGER_ROLE
    ? rows
    : rows.filter(
        (row) =>
          row.allowedRoles.length === 0 ||
          row.allowedRoles.includes(session.role) ||
          row.submissionId !== null,
      );
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

export const listCollectionSubmissions = async (formId: number) =>
  db
    .select()
    .from(collectionSubmission)
    .where(eq(collectionSubmission.fkFormId, formId))
    .orderBy(desc(collectionSubmission.updatedAt));
