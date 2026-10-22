"use server";

import { and, eq } from "drizzle-orm";
import crypto from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod/v4";
import {
  COLLECTION_CLUB_NAME,
  COLLECTION_DEFAULT_TITLE,
  COLLECTION_FORM_STATUSES,
} from "@/const/collection";
import { db } from "@/db/drizzle";
import {
  collectionForm,
  collectionSubmission,
  normalizeDepartmentKey,
} from "@/db/schema";
import { getCollectionFormById } from "@/lib/collection";
import {
  canFillCollectionForm,
  canManageCollectionForm,
} from "@/lib/collection-access";
import { isCollectionFormOpen } from "@/lib/collection-status";
import { verifySession } from "@/lib/dal";
import { writeOperationAudit } from "@/lib/operation-audit";
import {
  collectionFormInputSchema,
  collectionSubmissionSchema,
  validateExtraAnswers,
  type CollectionFormInput,
  type CollectionSubmissionInput,
} from "@/lib/validation/collection";

const formIdSchema = z.number().int().positive();

type ActionResult<T = undefined> =
  | { success: true; data?: T }
  | { success: false; message: string };

const failure = (message: string): { success: false; message: string } => ({
  success: false,
  message,
});

const parseDateTimeField = (value: number | null | undefined) => {
  if (value === null || value === undefined) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
};

/** 部长及以上发起收集；所有收集表对部员及以上开放（不按部门拆分）。 */
export async function createCollectionForm(
  input: CollectionFormInput,
): Promise<ActionResult<{ id: number }>> {
  const session = await verifySession();
  if (!canManageCollectionForm(session)) {
    return failure("仅部长及以上可发起收集表");
  }

  const parsed = collectionFormInputSchema.safeParse(input);
  if (!parsed.success) {
    return failure(parsed.error.issues[0]?.message ?? "收集表内容无效");
  }
  const startsAt = parseDateTimeField(parsed.data.startsAt);
  const deadline = parseDateTimeField(parsed.data.deadline);
  if (startsAt === undefined || deadline === undefined) {
    return failure("开始或截止时间无效");
  }
  if (startsAt && deadline && startsAt >= deadline) {
    return failure("开始时间必须早于截止时间");
  }

  const title = parsed.data.title.trim() || COLLECTION_DEFAULT_TITLE;
  const instructions = parsed.data.instructions.trim();

  const [created] = await db
    .insert(collectionForm)
    .values({
      title,
      instructions,
      extraFields: parsed.data.extraFields,
      shareToken: crypto.randomBytes(18).toString("base64url"),
      startsAt,
      deadline,
      allowedRoles: parsed.data.allowedRoles,
      status: "open",
      createdBy: session.uid,
    })
    .returning({ id: collectionForm.id });

  await writeOperationAudit({
    actorId: session.uid,
    actorRole: session.realRole,
    action: "collection.form.create",
    resourceType: "collection_form",
    resourceId: created.id,
    metadata: {
      title,
      extraFieldCount: parsed.data.extraFields.length,
      allowedRoles: parsed.data.allowedRoles,
      startsAt: startsAt?.toISOString() ?? null,
      deadline: deadline?.toISOString() ?? null,
    },
  });

  revalidatePath("/dashboard/collection");
  return { success: true, data: { id: created.id } };
}

/** 部长及以上可修改标题、说明、自定义收集项、身份与开始/截止时间（所有部长同权）。 */
export async function updateCollectionForm(
  formId: number,
  input: CollectionFormInput,
): Promise<ActionResult> {
  const session = await verifySession();
  if (!canManageCollectionForm(session)) {
    return failure("仅部长及以上可管理收集表");
  }

  const parsedFormId = formIdSchema.safeParse(formId);
  if (!parsedFormId.success) return failure("收集表不存在");

  const form = await getCollectionFormById(parsedFormId.data);
  if (!form) return failure("收集表不存在");

  const parsed = collectionFormInputSchema.safeParse(input);
  if (!parsed.success) {
    return failure(parsed.error.issues[0]?.message ?? "收集表内容无效");
  }
  const startsAt = parseDateTimeField(parsed.data.startsAt);
  const deadline = parseDateTimeField(parsed.data.deadline);
  if (startsAt === undefined || deadline === undefined) {
    return failure("开始或截止时间无效");
  }
  if (startsAt && deadline && startsAt >= deadline) {
    return failure("开始时间必须早于截止时间");
  }

  const title = parsed.data.title.trim() || COLLECTION_DEFAULT_TITLE;
  const instructions = parsed.data.instructions.trim();

  await db
    .update(collectionForm)
    .set({
      title,
      instructions,
      extraFields: parsed.data.extraFields,
      startsAt,
      deadline,
      allowedRoles: parsed.data.allowedRoles,
      updatedAt: new Date(),
    })
    .where(eq(collectionForm.id, form.id));

  await writeOperationAudit({
    actorId: session.uid,
    actorRole: session.realRole,
    action: "collection.form.update",
    resourceType: "collection_form",
    resourceId: form.id,
    metadata: {
      title,
      extraFieldCount: parsed.data.extraFields.length,
      allowedRoles: parsed.data.allowedRoles,
      startsAt: startsAt?.toISOString() ?? null,
      deadline: deadline?.toISOString() ?? null,
    },
  });

  revalidatePath("/dashboard/collection");
  revalidatePath(`/dashboard/collection/${form.id}`);
  return { success: true };
}

/** 部员及以上填写/修改自己的那一行；只能写自己，截止后不可写。 */
export async function saveCollectionSubmission(
  formId: number,
  input: CollectionSubmissionInput,
): Promise<ActionResult<{ id: number }>> {
  const session = await verifySession();

  const parsedFormId = formIdSchema.safeParse(formId);
  if (!parsedFormId.success) return failure("收集表不存在");

  const form = await getCollectionFormById(parsedFormId.data);
  if (!form) return failure("收集表不存在");
  if (!canFillCollectionForm(session, form)) {
    return failure("你的身份不在本表填写范围内");
  }
  if (!isCollectionFormOpen(form)) {
    return failure("该收集表已截止，无法继续填写");
  }

  const parsed = collectionSubmissionSchema.safeParse(input);
  if (!parsed.success) {
    return failure(parsed.error.issues[0]?.message ?? "填写内容无效");
  }

  const extra = validateExtraAnswers(form.extraFields, parsed.data.extraAnswers);
  if (!extra.success) return failure(extra.message);

  const values = {
    fkFormId: form.id,
    fkUserId: session.uid,
    department: normalizeDepartmentKey(session.department),
    clubName: COLLECTION_CLUB_NAME,
    ...parsed.data,
    extraAnswers: extra.answers,
  };

  const [saved] = await db
    .insert(collectionSubmission)
    .values(values)
    .onConflictDoUpdate({
      target: [collectionSubmission.fkFormId, collectionSubmission.fkUserId],
      set: {
        department: values.department,
        clubName: values.clubName,
        category: values.category,
        name: values.name,
        birthMonth: values.birthMonth,
        politicalStatus: values.politicalStatus,
        college: values.college,
        className: values.className,
        studentId: values.studentId,
        enrollmentYear: values.enrollmentYear,
        graduationYear: values.graduationYear,
        extraAnswers: values.extraAnswers,
        updatedAt: new Date(),
      },
    })
    .returning({ id: collectionSubmission.id });

  revalidatePath("/dashboard/collection");
  revalidatePath(`/dashboard/collection/${form.id}`);
  return { success: true, data: { id: saved.id } };
}

/** 部长及以上关闭/重新开放收集（截止时间过期时可延长截止时间恢复填写）。 */
export async function setCollectionFormStatus(
  formId: number,
  status: (typeof COLLECTION_FORM_STATUSES)[number],
): Promise<ActionResult> {
  const session = await verifySession();
  if (!canManageCollectionForm(session)) {
    return failure("仅部长及以上可管理收集表");
  }

  const parsedFormId = formIdSchema.safeParse(formId);
  const parsedStatus = z.enum(COLLECTION_FORM_STATUSES).safeParse(status);
  if (!parsedFormId.success || !parsedStatus.success) {
    return failure("收集表状态无效");
  }

  const form = await getCollectionFormById(parsedFormId.data);
  if (!form) return failure("收集表不存在");

  await db
    .update(collectionForm)
    .set({ status: parsedStatus.data, updatedAt: new Date() })
    .where(eq(collectionForm.id, form.id));

  await writeOperationAudit({
    actorId: session.uid,
    actorRole: session.realRole,
    action: "collection.form.status.update",
    resourceType: "collection_form",
    resourceId: form.id,
    metadata: { status: parsedStatus.data },
  });

  revalidatePath("/dashboard/collection");
  revalidatePath(`/dashboard/collection/${form.id}`);
  return { success: true };
}

/** 复制一张收集表作为新模板（不复制提交记录与分享凭据）。 */
export async function duplicateCollectionForm(
  formId: number,
): Promise<ActionResult<{ id: number }>> {
  const session = await verifySession();
  if (!canManageCollectionForm(session)) {
    return failure("仅部长及以上可管理收集表");
  }

  const parsedFormId = formIdSchema.safeParse(formId);
  if (!parsedFormId.success) return failure("收集表不存在");

  const form = await getCollectionFormById(parsedFormId.data);
  if (!form) return failure("收集表不存在");

  const [created] = await db
    .insert(collectionForm)
    .values({
      title: `${form.title}（副本）`.slice(0, 120),
      instructions: form.instructions,
      extraFields: form.extraFields,
      shareToken: crypto.randomBytes(18).toString("base64url"),
      allowedRoles: form.allowedRoles,
      status: "open",
      createdBy: session.uid,
    })
    .returning({ id: collectionForm.id });

  await writeOperationAudit({
    actorId: session.uid,
    actorRole: session.realRole,
    action: "collection.form.duplicate",
    resourceType: "collection_form",
    resourceId: created.id,
    metadata: { sourceFormId: form.id },
  });

  revalidatePath("/dashboard/collection");
  return { success: true, data: { id: created.id } };
}

/** 删除收集表及其全部提交（部长及以上）。 */
export async function deleteCollectionForm(formId: number): Promise<ActionResult> {
  const session = await verifySession();
  if (!canManageCollectionForm(session)) {
    return failure("仅部长及以上可管理收集表");
  }

  const parsedFormId = formIdSchema.safeParse(formId);
  if (!parsedFormId.success) return failure("收集表不存在");

  const form = await getCollectionFormById(parsedFormId.data);
  if (!form) return failure("收集表不存在");

  await db.delete(collectionForm).where(eq(collectionForm.id, form.id));

  await writeOperationAudit({
    actorId: session.uid,
    actorRole: session.realRole,
    action: "collection.form.delete",
    resourceType: "collection_form",
    resourceId: form.id,
    metadata: { title: form.title },
  });

  revalidatePath("/dashboard/collection");
  return { success: true };
}

/** 删除单条填写记录（部长及以上，用于清理误填/重复记录）。 */
export async function deleteCollectionSubmission(
  formId: number,
  submissionId: number,
): Promise<ActionResult> {
  const session = await verifySession();
  if (!canManageCollectionForm(session)) {
    return failure("仅部长及以上可管理收集表");
  }

  const parsedFormId = formIdSchema.safeParse(formId);
  const parsedSubmissionId = formIdSchema.safeParse(submissionId);
  if (!parsedFormId.success || !parsedSubmissionId.success) {
    return failure("填写记录不存在");
  }

  const [deleted] = await db
    .delete(collectionSubmission)
    .where(
      and(
        eq(collectionSubmission.id, parsedSubmissionId.data),
        eq(collectionSubmission.fkFormId, parsedFormId.data),
      ),
    )
    .returning({ id: collectionSubmission.id });
  if (!deleted) return failure("填写记录不存在");

  await writeOperationAudit({
    actorId: session.uid,
    actorRole: session.realRole,
    action: "collection.submission.delete",
    resourceType: "collection_submission",
    resourceId: deleted.id,
    metadata: { formId: parsedFormId.data },
  });

  revalidatePath("/dashboard/collection");
  revalidatePath(`/dashboard/collection/${parsedFormId.data}`);
  return { success: true };
}
