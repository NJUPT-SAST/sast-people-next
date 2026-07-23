"use server";

import { db } from "@/db/drizzle";
import { emailTemplateSetting } from "@/db/schema";
import { verifyRole } from "@/lib/dal";
import { writeOperationAudit } from "@/lib/operation-audit";
import { logServerError } from "@/lib/server-error-log";
import {
  defaultResultEmailTemplateSettings,
  type ResultEmailTemplateSetting,
} from "@/lib/email/template-settings";
import { renderEmailTemplate } from "@/lib/email-center/render";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

type ResultEmailTemplateValues = Omit<ResultEmailTemplateSetting, "templateKey">;

const requiredFieldLabels: Record<keyof ResultEmailTemplateValues, string> = {
  subjectTemplate: "邮件标题",
  memberInfoFormUrl: "成员信息表链接",
  feishuGroupUrl: "飞书群链接",
  calendarUrl: "活动日历链接",
  feishuRegisterHelpUrl: "飞书注册说明",
  contactEmail: "联系邮箱",
  memberFormLabel: "表单按钮文案",
  feishuGroupName: "飞书群名",
};

const urlFields: Array<keyof ResultEmailTemplateValues> = [
  "memberInfoFormUrl",
  "feishuGroupUrl",
  "calendarUrl",
  "feishuRegisterHelpUrl",
];

function normalizeResultEmailTemplateValues(
  values: ResultEmailTemplateValues,
): ResultEmailTemplateValues {
  return {
    subjectTemplate: values.subjectTemplate.trim(),
    memberInfoFormUrl: values.memberInfoFormUrl.trim(),
    feishuGroupUrl: values.feishuGroupUrl.trim(),
    calendarUrl: values.calendarUrl.trim(),
    feishuRegisterHelpUrl: values.feishuRegisterHelpUrl.trim(),
    contactEmail: values.contactEmail.trim(),
    memberFormLabel: values.memberFormLabel.trim(),
    feishuGroupName: values.feishuGroupName.trim(),
  };
}

function isHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function validateResultEmailTemplateValues(values: ResultEmailTemplateValues) {
  for (const [key, label] of Object.entries(requiredFieldLabels) as Array<
    [keyof ResultEmailTemplateValues, string]
  >) {
    if (!values[key]) {
      return { ok: false, message: `${label}不能为空。` };
    }
  }

  if (!values.subjectTemplate.includes("{flowName}")) {
    return { ok: false, message: "邮件标题需要包含 {flowName}。" };
  }

  for (const field of urlFields) {
    if (!isHttpUrl(values[field])) {
      return {
        ok: false,
        message: `${requiredFieldLabels[field]}需要是 http 或 https 链接。`,
      };
    }
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.contactEmail)) {
    return { ok: false, message: "联系邮箱格式不正确。" };
  }

  return { ok: true };
}

export async function listEmailTemplateSettings() {
  await verifyRole(3);

  const rows = await db.select().from(emailTemplateSetting);
  return defaultResultEmailTemplateSettings.map((fallback) => {
    const saved = rows.find((item) => item.templateKey === fallback.templateKey);
    return {
      ...fallback,
      ...saved,
    };
  });
}

export async function getResultEmailPreviews() {
  await verifyRole(3);
  const settings = await listEmailTemplateSettings();
  const entries = await Promise.all(
    settings.map(async (setting) => {
      const accept = setting.templateKey.endsWith("accepted");
      const rendered = await renderEmailTemplate({
        templateKey: accept
          ? "recruitment.result.accepted"
          : "recruitment.result.rejected",
        variables: {
          name: "同学",
          flowName: "示例流程",
          setting,
          genericGreeting: true,
        },
      });
      return [setting.templateKey, rendered.html] as const;
    }),
  );
  return Object.fromEntries(entries) as Record<string, string>;
}

export async function getEmailTemplateSetting(templateKey: string) {
  const [saved] = await db
    .select()
    .from(emailTemplateSetting)
    .where(eq(emailTemplateSetting.templateKey, templateKey))
    .limit(1);

  return (
    saved ??
    defaultResultEmailTemplateSettings.find(
      (item) => item.templateKey === templateKey,
    )!
  );
}

export async function updateEmailTemplateSetting(
  templateKey: string,
  values: ResultEmailTemplateValues,
) {
  const session = await verifyRole(3);
  const normalized = normalizeResultEmailTemplateValues(values);
  const validation = validateResultEmailTemplateValues(normalized);

  if (!validation.ok) {
    return validation;
  }

  try {
    const [existing] = await db
      .select({ id: emailTemplateSetting.id })
      .from(emailTemplateSetting)
      .where(eq(emailTemplateSetting.templateKey, templateKey))
      .limit(1);
    let templateSettingId = existing?.id ?? null;

    if (existing) {
      await db
        .update(emailTemplateSetting)
        .set(normalized)
        .where(eq(emailTemplateSetting.templateKey, templateKey));
    } else {
      const [created] = await db
        .insert(emailTemplateSetting)
        .values({
          templateKey,
          ...normalized,
        })
        .returning({ id: emailTemplateSetting.id });
      templateSettingId = created?.id ?? null;
    }

    await writeOperationAudit({
      actorId: session.uid,
      action: "email.template.update",
      resourceType: "email_template_setting",
      resourceId: templateSettingId,
      metadata: {
        templateKey,
        mode: existing ? "update" : "create",
        changedFields: Object.keys(normalized),
      },
    });

    revalidatePath("/dashboard/emails");
    return { ok: true };
  } catch (error) {
    logServerError("email:updateTemplate", error, {
      path: "/dashboard/emails",
      userId: session.uid,
      role: session.role,
      action: "update-email-template",
      metadata: { templateKey },
    });

    const message = error instanceof Error ? error.message : String(error);
    if (
      message.includes("permission denied") ||
      message.includes("must be owner")
    ) {
      return {
        ok: false,
        message: "数据库权限不足，请先执行最新迁移 0009 后再保存。",
      };
    }

    return { ok: false, message: "模板保存失败，请查看错误日志。" };
  }
}
