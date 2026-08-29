"use server";

import { db } from "@/db/drizzle";
import { emailTemplateContent } from "@/db/schema";
import { verifyRole } from "@/lib/dal";
import {
  getInterviewNotificationTemplateDefault,
  getInterviewScheduleEmailKindByTemplateKey,
  getInterviewScheduleTemplateSetting,
  INTERVIEW_WITHDRAWAL_TEMPLATE_KEY,
  interviewScheduleTemplateKeys,
  listInterviewScheduleTemplateSettings,
  type InterviewNotificationTemplateKey,
  type InterviewScheduleTemplateSetting,
} from "@/lib/email/interview-template-settings";
import { renderInterviewScheduleEmailPreview } from "@/lib/email/interview-schedule";
import { renderInterviewWithdrawalEmailPreview } from "@/lib/email-center/interview-withdrawal";
import { writeOperationAudit } from "@/lib/operation-audit";
import { logServerError } from "@/lib/server-error-log";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

type InterviewScheduleTemplateValues = Omit<
  InterviewScheduleTemplateSetting,
  "templateKey"
>;

const hasRequiredVariables = (value: string, variables: readonly string[]) =>
  variables.every((variable) => value.includes(`{${variable}}`));

function normalizeInterviewTemplateKey(
  templateKey: string,
): InterviewNotificationTemplateKey {
  const allowedKeys = [
    ...Object.values(interviewScheduleTemplateKeys),
    INTERVIEW_WITHDRAWAL_TEMPLATE_KEY,
  ];
  return allowedKeys.includes(templateKey as InterviewNotificationTemplateKey)
    ? (templateKey as InterviewNotificationTemplateKey)
    : interviewScheduleTemplateKeys.created;
}

export async function getInterviewScheduleEmailTemplate() {
  await verifyRole(3);
  return getInterviewScheduleTemplateSetting();
}

export async function listInterviewScheduleEmailTemplates() {
  await verifyRole(3);
  return listInterviewScheduleTemplateSettings();
}

export async function getInterviewScheduleEmailPreview() {
  await verifyRole(3);
  return renderInterviewScheduleEmailPreview();
}

export async function getInterviewScheduleEmailPreviews() {
  await verifyRole(3);
  const scheduleEntries = await Promise.all(
    Object.values(interviewScheduleTemplateKeys).map(async (templateKey) => {
      const kind = getInterviewScheduleEmailKindByTemplateKey(templateKey);
      return [templateKey, await renderInterviewScheduleEmailPreview(kind)] as const;
    }),
  );
  const withdrawalPreview = await renderInterviewWithdrawalEmailPreview();
  return Object.fromEntries([
    ...scheduleEntries,
    [INTERVIEW_WITHDRAWAL_TEMPLATE_KEY, withdrawalPreview],
  ]) as Record<InterviewNotificationTemplateKey, string>;
}

export async function updateInterviewScheduleEmailTemplate(
  templateKey: string,
  values: InterviewScheduleTemplateValues,
) {
  const session = await verifyRole(3);
  const normalizedTemplateKey = normalizeInterviewTemplateKey(templateKey);

  const normalized = {
    subjectTemplate: values.subjectTemplate.trim(),
    titleTemplate: values.titleTemplate.trim(),
    bodyTemplate: values.bodyTemplate.trim(),
    footerText: values.footerText.trim(),
  };

  if (!normalized.subjectTemplate) {
    return { ok: false, message: "邮件标题不能为空。" };
  }
  if (!normalized.titleTemplate) {
    return { ok: false, message: "邮件主标题不能为空。" };
  }
  if (!normalized.bodyTemplate) {
    return { ok: false, message: "正文说明不能为空。" };
  }
  if (!normalized.footerText) {
    return { ok: false, message: "落款不能为空。" };
  }
  const requiredBodyVariables = ["candidateName", "flowName"];
  if (!hasRequiredVariables(normalized.bodyTemplate, requiredBodyVariables)) {
    return {
      ok: false,
      message: "正文里需要包含 {candidateName} 和 {flowName}，方便系统替换候选人和流程名称。",
    };
  }
  if (
    normalizedTemplateKey === INTERVIEW_WITHDRAWAL_TEMPLATE_KEY &&
    normalized.bodyTemplate.includes("{reason}")
  ) {
    return {
      ok: false,
      message: "退回理由会自动显示在下方信息卡中，请不要在正文重复填写 {reason}。",
    };
  }

  try {
    const [existing] = await db
      .select({ id: emailTemplateContent.id })
      .from(emailTemplateContent)
      .where(eq(emailTemplateContent.templateKey, normalizedTemplateKey))
      .limit(1);
    let templateContentId = existing?.id ?? null;

    if (existing) {
      await db
        .update(emailTemplateContent)
        .set(normalized)
        .where(eq(emailTemplateContent.templateKey, normalizedTemplateKey));
    } else {
      const [created] = await db
        .insert(emailTemplateContent)
        .values({
          templateKey: normalizedTemplateKey,
          ...normalized,
        })
        .returning({ id: emailTemplateContent.id });
      templateContentId = created?.id ?? null;
    }

    await writeOperationAudit({
      actorId: session.uid,
      actorRole: session.role,
      action: "email.template.update",
      resourceType: "email_template_content",
      resourceId: templateContentId,
      metadata: {
        templateKey: normalizedTemplateKey,
        mode: existing ? "update" : "create",
        changedFields: Object.keys(normalized),
      },
    });

    revalidatePath("/dashboard/emails");
    return { ok: true };
  } catch (error) {
    logServerError("email:updateInterviewTemplate", error, {
      path: "/dashboard/emails",
      userId: session.uid,
      role: session.role,
      action: "update-interview-email-template",
      metadata: { templateKey: normalizedTemplateKey },
    });
    return { ok: false, message: "面试通知模板保存失败，请查看错误日志。" };
  }
}

export async function resetInterviewScheduleEmailTemplate(templateKey: string) {
  const session = await verifyRole(3);
  const normalizedTemplateKey = normalizeInterviewTemplateKey(templateKey);

  await db
    .delete(emailTemplateContent)
    .where(eq(emailTemplateContent.templateKey, normalizedTemplateKey));
  await writeOperationAudit({
    actorId: session.uid,
    actorRole: session.role,
    action: "email.template.reset",
    resourceType: "email_template_content",
    resourceId: null,
    metadata: {
      templateKey: normalizedTemplateKey,
    },
  });
  revalidatePath("/dashboard/emails");
  return getInterviewNotificationTemplateDefault(normalizedTemplateKey);
}
