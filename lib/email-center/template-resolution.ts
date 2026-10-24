import "server-only";

import { db } from "@/db/drizzle";
import { emailTemplateSetting } from "@/db/schema";
import { pickTemplateSettingRow } from "@/lib/email-center/template-access";
import { parseEmailBlocks, parseEmailFrame } from "@/lib/email/blocks";
import {
  defaultResultEmailTemplateSettings,
  type ResultEmailTemplateSetting,
} from "@/lib/email/template-settings";
import { inArray } from "drizzle-orm";

export type EmailTemplateSettingRecord =
  typeof emailTemplateSetting.$inferSelect;

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
    /* 区块与主题色是「未设置即回落内置」的可选覆盖，不做空值填充 */
    bodyBlocks: parseEmailBlocks(saved.bodyBlocks),
    /* 外框解析成完整值：编辑器拿到的是当前生效外观，直接改就行 */
    bodyFrame: parseEmailFrame(saved.bodyFrame),
    themeColor: saved.themeColor ?? fallback.themeColor,
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
  const settings = await readResultEmailTemplateSettings([templateKey], department);
  return settings.get(templateKey)!;
}

/**
 * 一次取回多个模板的候选行（模板 × 全局/部门覆盖），供调用方在内存里逐项解析。
 * 模板页要渲染十几个模板，逐键查询会把同一张表打十几次（Sentry N+1）。
 */
export async function loadResultEmailTemplateSettingRows(
  templateKeys: readonly string[],
): Promise<EmailTemplateSettingRecord[]> {
  const uniqueKeys = [...new Set(templateKeys)];
  if (uniqueKeys.length === 0) return [];

  return db
    .select()
    .from(emailTemplateSetting)
    .where(inArray(emailTemplateSetting.templateKey, uniqueKeys));
}

/** 纯解析：从已取回的候选行里按模板键 + 部门取覆盖行，不访问数据库 */
export function resolveResultEmailTemplateSetting(
  templateKey: string,
  department: string | null | undefined,
  rows: EmailTemplateSettingRecord[],
): ResultEmailTemplateResolvedSetting {
  const candidates = rows.filter((row) => row.templateKey === templateKey);
  return mergeResultEmailTemplateSetting(
    templateKey,
    pickTemplateSettingRow(candidates, department),
  );
}

/** 批量解析：同一部门下多个模板，只查一次库 */
export async function readResultEmailTemplateSettings(
  templateKeys: readonly string[],
  department?: string | null,
): Promise<Map<string, ResultEmailTemplateResolvedSetting>> {
  const uniqueKeys = [...new Set(templateKeys)];
  const rows = await loadResultEmailTemplateSettingRows(uniqueKeys);

  return new Map(
    uniqueKeys.map((templateKey) => [
      templateKey,
      resolveResultEmailTemplateSetting(templateKey, department, rows),
    ]),
  );
}
