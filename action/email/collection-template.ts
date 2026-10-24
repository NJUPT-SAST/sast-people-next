"use server";

import { revalidatePath } from "next/cache";
import { getDepartmentScope } from "@/lib/authz";
import { buildCollectionInvitationEmail, type CollectionInvitationTemplateValues } from "@/lib/collection/invitation-email";
import { verifyRole } from "@/lib/dal";
import {
  COLLECTION_INVITATION_TEMPLATE_KEY,
  deleteCollectionInvitationTemplateSetting,
  getCollectionInvitationTemplateSetting,
  upsertCollectionInvitationTemplateSetting,
} from "@/lib/email/collection-template-settings";
import { canEditTemplateRow } from "@/lib/email-center/template-access";
import { writeOperationAudit } from "@/lib/operation-audit";
import { logServerError } from "@/lib/server-error-log";

const PREVIEW_INPUT = {
  formTitle: "社团成员信息收集表",
  deadlineLabel: "2026-10-30 18:00:00",
  url: "https://people.sast.fun/collect/example",
  message: "请在本周五前完成填写，谢谢！",
};

export async function getCollectionInvitationTemplatePanel() {
  await verifyRole(3);
  const scope = await getDepartmentScope();
  const setting = await getCollectionInvitationTemplateSetting(scope);
  const preview = buildCollectionInvitationEmail({
    ...PREVIEW_INPUT,
    template: setting,
  }).html;
  return { setting, preview };
}

export async function updateCollectionInvitationTemplate(
  values: CollectionInvitationTemplateValues,
) {
  try {
    const session = await verifyRole(3);
    const scope = await getDepartmentScope();
    if (!canEditTemplateRow(scope, null)) {
      return { ok: false as const, message: "仅管理员可编辑全局收集表邀请模板。" };
    }

    const normalized = {
      subjectTemplate: values.subjectTemplate.trim(),
      titleTemplate: values.titleTemplate.trim(),
      bodyTemplate: values.bodyTemplate.trim(),
      footerText: values.footerText.trim(),
    };
    if (!normalized.subjectTemplate) {
      return { ok: false as const, message: "邮件标题不能为空。" };
    }
    if (!normalized.titleTemplate) {
      return { ok: false as const, message: "邮件主标题不能为空。" };
    }
    if (!normalized.bodyTemplate) {
      return { ok: false as const, message: "邮件正文不能为空。" };
    }

    const result = await upsertCollectionInvitationTemplateSetting(normalized);
    await writeOperationAudit({
      actorId: session.uid,
      actorRole: session.realRole,
      action: "email.template.update",
      resourceType: "email_template_content",
      resourceId: result.id,
      metadata: { templateKey: COLLECTION_INVITATION_TEMPLATE_KEY },
    });
    revalidatePath("/dashboard/emails");
    return { ok: true as const };
  } catch (error) {
    logServerError("email:collection-template:update", error, {
      path: "/dashboard/emails",
      action: "update-collection-invitation-template",
    });
    return { ok: false as const, message: "保存失败，请稍后重试。" };
  }
}

export async function resetCollectionInvitationTemplate() {
  try {
    const session = await verifyRole(3);
    const scope = await getDepartmentScope();
    if (!canEditTemplateRow(scope, null)) {
      return { ok: false as const, message: "仅管理员可编辑全局收集表邀请模板。" };
    }

    const deleted = await deleteCollectionInvitationTemplateSetting();
    if (deleted) {
      await writeOperationAudit({
        actorId: session.uid,
        actorRole: session.realRole,
        action: "email.template.reset",
        resourceType: "email_template_content",
        metadata: { templateKey: COLLECTION_INVITATION_TEMPLATE_KEY },
      });
    }
    revalidatePath("/dashboard/emails");
    return { ok: true as const };
  } catch (error) {
    logServerError("email:collection-template:reset", error, {
      path: "/dashboard/emails",
      action: "reset-collection-invitation-template",
    });
    return { ok: false as const, message: "恢复失败，请稍后重试。" };
  }
}
