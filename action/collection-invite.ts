"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod/v4";
import { db } from "@/db/drizzle";
import { collectionInvitation, userFlow } from "@/db/schema";
import { getPublicBaseUrl } from "@/lib/app-url";
import {
  getCollectionFormById,
  getFormSubmittedUserIds,
  getPassedFlowIdsByUserIds,
} from "@/lib/collection";
import {
  canFillCollectionForm,
  canManageCollectionForm,
} from "@/lib/collection-access";
import { collectionFormPhase } from "@/lib/collection-status";
import { buildCollectionInvitationEmail } from "@/lib/collection/invitation-email";
import { getCollectionInvitationTemplateSetting } from "@/lib/email/collection-template-settings";
import { verifySession } from "@/lib/dal";
import { sendEmailViaProvider } from "@/lib/email-center/provider";
import { getLinkAdminAccessTokenFromSession } from "@/lib/link/session";
import { getLinkUsersByIds, listLinkUsers } from "@/lib/link/admin";
import { linkRoleToPeopleRole } from "@/lib/link/role";
import type { LinkAdminUserItem, LinkUserProfile } from "@/lib/link/types";
import { writeOperationAudit } from "@/lib/operation-audit";
import { logServerError } from "@/lib/server-error-log";
import { formatBeijingDateTime } from "@/lib/timezone";

const MAX_CANDIDATES = 1000;
const MAX_INVITES = 50;

export type CollectionInviteCandidate = {
  id: number;
  name: string;
  studentId: string | null;
  email: string | null;
  phone: string | null;
  role: number;
  department: string | null;
  college: string | null;
};

type ActionResult<T = undefined> =
  | { success: true; data?: T }
  | { success: false; message: string };

const failure = (message: string): { success: false; message: string } => ({
  success: false,
  message,
});

const searchInputSchema = z.object({
  formId: z.number().int().positive(),
  flowIds: z.array(z.number().int().positive()).max(100).default([]),
  cohort: z.string().trim().max(20).default(""),
  keyword: z.string().trim().max(100).default(""),
});

const sendInputSchema = z.object({
  formId: z.number().int().positive(),
  userIds: z
    .array(z.number().int().positive())
    .min(1, "请至少选择一位成员")
    .max(MAX_INVITES, `单次最多邀请 ${MAX_INVITES} 人`),
  sendEmail: z.boolean().default(true),
  message: z.string().trim().max(500).optional(),
});

const matchesCohort = (studentId: string | null, cohort: string) => {
  const trimmed = cohort.trim();
  if (!trimmed) return true;
  if (!studentId) return false;

  const digits = trimmed.replace(/\D/g, "");
  if (!digits) return studentId.includes(trimmed);

  const studentDigits = studentId.replace(/\D/g, "");
  return (
    studentDigits.includes(digits) ||
    (digits.length === 4 && studentDigits.includes(digits.slice(-2)))
  );
};

const matchesKeyword = (candidate: CollectionInviteCandidate, keyword: string) => {
  const trimmed = keyword.trim().toLowerCase();
  if (!trimmed) return true;
  return [candidate.name, candidate.studentId, candidate.phone, candidate.email]
    .filter(Boolean)
    .some((value) => value!.toLowerCase().includes(trimmed));
};

const toCandidateFromAdminItem = (
  item: LinkAdminUserItem,
): CollectionInviteCandidate => ({
  id: item.id,
  name: item.name,
  studentId: item.student_id ?? null,
  email: item.login_email ?? null,
  phone: item.phone_number ?? null,
  role: linkRoleToPeopleRole(item.role),
  department: item.department ?? null,
  college: item.college ?? null,
});

const toCandidateFromProfile = (
  item: LinkUserProfile,
): CollectionInviteCandidate => ({
  id: item.id,
  name: item.name,
  studentId: item.student_id ?? null,
  email: item.login_email ?? item.profile?.email ?? null,
  phone: item.phone_number ?? null,
  role: linkRoleToPeopleRole(item.role),
  department: item.profile?.department ?? null,
  college: item.college ?? null,
});

const emailOfProfile = (profile: LinkUserProfile) =>
  profile.login_email ?? profile.profile?.email ?? null;

const fetchProfilesByIds = async (ids: number[]): Promise<LinkUserProfile[]> => {
  if (ids.length === 0) return [];
  const token = await getLinkAdminAccessTokenFromSession();
  const users: LinkUserProfile[] = [];
  for (let index = 0; index < ids.length; index += 100) {
    const chunk = ids.slice(index, index + 100);
    users.push(...(await getLinkUsersByIds(token, chunk)));
  }
  return users;
};

/**
 * 多条件筛选候选人：流程（最终通过）、届别、姓名/学号/手机号/邮箱。
 * 只返回当前表单允许填写、且尚未提交的人。
 */
export async function searchCollectionInviteCandidates(input: {
  formId: number;
  flowIds: number[];
  cohort: string;
  keyword: string;
}): Promise<
  ActionResult<{
    candidates: CollectionInviteCandidate[];
    scanned: number;
    truncated: boolean;
  }>
> {
  const session = await verifySession();
  if (!canManageCollectionForm(session)) {
    return failure("仅部长及以上可邀请成员");
  }

  const parsed = searchInputSchema.safeParse(input);
  if (!parsed.success) {
    return failure(parsed.error.issues[0]?.message ?? "筛选条件无效");
  }

  const form = await getCollectionFormById(parsed.data.formId);
  if (!form) return failure("收集表不存在");

  const token = await getLinkAdminAccessTokenFromSession();
  let source: CollectionInviteCandidate[] = [];
  let truncated = false;
  const effectiveFlowIds =
    parsed.data.flowIds.length > 0 ? parsed.data.flowIds : form.allowedFlowIds;

  if (effectiveFlowIds.length > 0) {
    const passedRows = await db
      .selectDistinct({ userId: userFlow.fkUserId })
      .from(userFlow)
      .where(
        and(
          eq(userFlow.progressStatus, "passed"),
          inArray(userFlow.fkFlowId, effectiveFlowIds),
        ),
      )
      .limit(MAX_CANDIDATES + 1);
    truncated = passedRows.length > MAX_CANDIDATES;
    const ids = passedRows.slice(0, MAX_CANDIDATES).map((row) => row.userId);
    source = (await fetchProfilesByIds(ids))
      .filter((item) => item.state !== "is_deleted")
      .map(toCandidateFromProfile);
  } else {
    let scanned = 0;
    let total = 0;
    /* Link 的 keyword 不保证匹配手机号；手机号搜索时在本地过滤前不要先被 Link 丢弃 */
    const linkKeyword = /^[0-9+\-() ]{7,20}$/.test(parsed.data.keyword.trim())
      ? undefined
      : parsed.data.keyword || undefined;
    for (let page = 1; page <= 10; page += 1) {
      const result = await listLinkUsers(token, {
        page,
        pageSize: 100,
        keyword: linkKeyword,
      });
      total = result.total;
      source.push(
        ...result.users
          .filter((item) => item.state !== "is_deleted")
          .map(toCandidateFromAdminItem),
      );
      scanned += result.users.length;
      if (scanned >= total) break;
    }
    truncated = total > scanned;
  }

  const filtered = source.filter(
    (candidate) =>
      matchesCohort(candidate.studentId, parsed.data.cohort) &&
      matchesKeyword(candidate, parsed.data.keyword),
  );
  const ids = filtered.map((candidate) => candidate.id);
  const [passedMap, submitted] = await Promise.all([
    getPassedFlowIdsByUserIds(ids),
    getFormSubmittedUserIds(form.id, ids),
  ]);
  const candidates = filtered.filter(
    (candidate) =>
      !submitted.has(candidate.id) &&
      canFillCollectionForm(
        { role: candidate.role },
        form,
        passedMap.get(candidate.id) ?? [],
      ),
  );

  candidates.sort((left, right) =>
    `${left.studentId ?? ""}${left.name}`.localeCompare(
      `${right.studentId ?? ""}${right.name}`,
      "zh-CN",
    ),
  );

  return {
    success: true,
    data: {
      candidates,
      scanned: source.length,
      truncated,
    },
  };
}

/**
 * 批量邀请：记录邀请并可选发送邮件。
 * 会再次校验填写范围并排除已提交的人，避免把无效邀请发出去。
 */
export async function sendCollectionInvitations(input: {
  formId: number;
  userIds: number[];
  sendEmail: boolean;
  message?: string;
}): Promise<
  ActionResult<{
    invited: number;
    emailed: number;
    failed: number;
    skipped: number;
  }>
> {
  const session = await verifySession();
  if (!canManageCollectionForm(session)) {
    return failure("仅部长及以上可邀请成员");
  }

  const parsed = sendInputSchema.safeParse(input);
  if (!parsed.success) {
    return failure(parsed.error.issues[0]?.message ?? "邀请参数无效");
  }

  const form = await getCollectionFormById(parsed.data.formId);
  if (!form) return failure("收集表不存在");
  if (collectionFormPhase(form) !== "open") {
    return failure("仅在收集期间可以邀请成员");
  }

  const userIds = Array.from(new Set(parsed.data.userIds));
  const profiles = await fetchProfilesByIds(userIds);
  const [passedMap, submitted] = await Promise.all([
    getPassedFlowIdsByUserIds(profiles.map((profile) => profile.id)),
    getFormSubmittedUserIds(form.id, profiles.map((profile) => profile.id)),
  ]);

  const eligible = profiles.filter((profile) => {
    if (profile.state === "is_deleted" || submitted.has(profile.id)) return false;
    return canFillCollectionForm(
      { role: linkRoleToPeopleRole(profile.role) },
      form,
      passedMap.get(profile.id) ?? [],
    );
  });

  if (eligible.length === 0) {
    return failure("筛选出的成员当前都不在填写范围内（或已经提交）");
  }

  for (const profile of eligible) {
    await db
      .insert(collectionInvitation)
      .values({
        fkFormId: form.id,
        fkUserId: profile.id,
        name: profile.name,
        studentId: profile.student_id ?? null,
        email: emailOfProfile(profile),
        invitedBy: session.uid,
        status: "pending",
      })
      .onConflictDoUpdate({
        target: [collectionInvitation.fkFormId, collectionInvitation.fkUserId],
        set: {
          name: profile.name,
          studentId: profile.student_id ?? null,
          email: emailOfProfile(profile),
          invitedBy: session.uid,
          status: "pending",
          error: null,
          sentAt: null,
          updatedAt: new Date(),
        },
      });
  }

  let emailed = 0;
  let failed = 0;

  if (parsed.data.sendEmail) {
    const url = `${getPublicBaseUrl()}/collect/${form.shareToken}`;
    const deadlineLabel = form.deadline
      ? formatBeijingDateTime(form.deadline)
      : null;
    const template = await getCollectionInvitationTemplateSetting();

    for (const profile of eligible) {
      const emailAddress = emailOfProfile(profile);
      if (!emailAddress) {
        failed += 1;
        await db
          .update(collectionInvitation)
          .set({
            status: "failed",
            error: "缺少邮箱地址",
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(collectionInvitation.fkFormId, form.id),
              eq(collectionInvitation.fkUserId, profile.id),
            ),
          );
        continue;
      }

      const email = buildCollectionInvitationEmail({
        formTitle: form.title,
        deadlineLabel,
        url,
        message: parsed.data.message,
        template,
      });

      try {
        await sendEmailViaProvider({
          to: emailAddress,
          subject: email.subject,
          html: email.html,
        });
        emailed += 1;
        await db
          .update(collectionInvitation)
          .set({
            status: "sent",
            error: null,
            sentAt: new Date(),
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(collectionInvitation.fkFormId, form.id),
              eq(collectionInvitation.fkUserId, profile.id),
            ),
          );
      } catch (error) {
        failed += 1;
        await db
          .update(collectionInvitation)
          .set({
            status: "failed",
            error:
              error instanceof Error
                ? error.message.slice(0, 500)
                : "邮件发送失败",
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(collectionInvitation.fkFormId, form.id),
              eq(collectionInvitation.fkUserId, profile.id),
            ),
          );
      }
    }
  }

  await writeOperationAudit({
    actorId: session.uid,
    actorRole: session.realRole,
    action: "collection.invitation.send",
    resourceType: "collection_form",
    resourceId: form.id,
    metadata: {
      invited: eligible.length,
      emailed,
      failed,
      skipped: userIds.length - eligible.length,
      sendEmail: parsed.data.sendEmail,
    },
  });

  revalidatePath("/dashboard/collection");
  revalidatePath(`/dashboard/collection/${form.id}`);

  if (parsed.data.sendEmail && emailed === 0 && failed > 0) {
    logServerError("collection:invitation:email", new Error("所有邀请邮件发送失败"), {
      path: `/dashboard/collection/${form.id}`,
      userId: session.uid,
      role: session.role,
      action: "send-collection-invitation",
      metadata: { formId: form.id, failed },
    });
  }

  return {
    success: true,
    data: {
      invited: eligible.length,
      emailed,
      failed,
      skipped: userIds.length - eligible.length,
    },
  };
}
