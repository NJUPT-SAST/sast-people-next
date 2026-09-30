import "server-only";

import { db } from "@/db/drizzle";
import { emailTemplateSetting } from "@/db/schema";
import { pickTemplateSettingRow } from "@/lib/email-center/template-access";
import {
  defaultResultEmailTemplateSettings,
  type ResultEmailTemplateSetting,
} from "@/lib/email/template-settings";
import { eq } from "drizzle-orm";

type EmailTemplateSettingRecord = typeof emailTemplateSetting.$inferSelect;

/** 解析后的结果模板：`department` 为命中覆盖行的归属部门，NULL = 落到全局默认 / 内置默认 */
export type ResultEmailTemplateResolvedSetting = ResultEmailTemplateSetting & {
  department: string | null;
};

/**
 * 合并解析结果模板：内置默认 → 全局默认行 → 命中的部门覆盖行。
 * 文案字段为空时继续回落到内置默认，避免历史空行渲染出空白邮件。
 */
export function mergeResultEmailTemplateSetting(
  templateKey: string,
  saved: EmailTemplateSettingRecord | null,
): ResultEmailTemplateResolvedSetting {
  const fallback = defaultResultEmailTemplateSettings.find(
    (item) => item.templateKey === templateKey,
  )!;
  if (!saved) return { ...fallback, department: null };

  return {
    templateKey,
    updatedAt: saved.updatedAt,
    subjectTemplate: saved.subjectTemplate,
    titleTemplate: saved.titleTemplate?.trim() || fallback.titleTemplate,
    subtitleTemplate: saved.subtitleTemplate?.trim() || fallback.subtitleTemplate,
    resultBadgeTemplate: saved.resultBadgeTemplate?.trim() || fallback.resultBadgeTemplate,
    resultTitleTemplate: saved.resultTitleTemplate?.trim() || fallback.resultTitleTemplate,
    resultSummaryTemplate: saved.resultSummaryTemplate?.trim() || fallback.resultSummaryTemplate,
    bodyTemplate: saved.bodyTemplate?.trim() || fallback.bodyTemplate,
    memberInfoFormUrl: saved.memberInfoFormUrl,
    feishuGroupUrl: saved.feishuGroupUrl,
    calendarUrl: saved.calendarUrl,
    feishuRegisterHelpUrl: saved.feishuRegisterHelpUrl,
    contactEmail: saved.contactEmail,
    memberFormLabel: saved.memberFormLabel,
    feishuGroupName: saved.feishuGroupName,
    groupNumber: saved.groupNumber ?? fallback.groupNumber,
    department: saved.department ?? null,
  };
}

/**
 * 无域读取：部门覆盖 → 全局默认 → 内置默认。
 *
 * 这里刻意不做会话校验，因此 **不能** 作为 server action 直接暴露——
 * 渲染、发布、批量发送等内部链路直接调用它；
 * 对外入口是 action/email/template.ts 里的 `getEmailTemplateSetting`，
 * 由该 action 负责 `verifyRole` 与读取范围校验，避免任意调用方越权读取部门文案。
 */
export async function readResultEmailTemplateSetting(
  templateKey: string,
  department?: string | null,
): Promise<ResultEmailTemplateResolvedSetting> {
  const rows = await db
    .select()
    .from(emailTemplateSetting)
    .where(eq(emailTemplateSetting.templateKey, templateKey));
  const saved = pickTemplateSettingRow(rows, department);

  return mergeResultEmailTemplateSetting(templateKey, saved);
}
