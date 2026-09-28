"use server";

import { db } from "@/db/drizzle";
import { emailTemplateSetting, normalizeDepartmentKey } from "@/db/schema";
import { getDepartmentScope, type DepartmentScope } from "@/lib/authz";
import { verifyRole } from "@/lib/dal";
import {
  canEditTemplateRow,
  pickTemplateSettingRow,
  resolveTemplateEditTarget,
  templateReadFilter,
} from "@/lib/email-center/template-access";
import { writeOperationAudit } from "@/lib/operation-audit";
import { logServerError } from "@/lib/server-error-log";
import {
  defaultResultEmailTemplateSettings,
  type ResultEmailTemplateSetting,
} from "@/lib/email/template-settings";
import { renderEmailTemplate } from "@/lib/email-center/render";
import type { ResultEmailTemplateKey } from "@/lib/email-center/types";
import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";

type ResultEmailTemplateValues = Omit<ResultEmailTemplateSetting, "templateKey" | "updatedAt">;

type EmailTemplateSettingRecord = typeof emailTemplateSetting.$inferSelect;

/** 解析后的结果模板：`department` 为命中覆盖行的归属部门，NULL = 落到全局默认 / 内置默认 */
export type ResultEmailTemplateResolvedSetting = ResultEmailTemplateSetting & {
  department: string | null;
};

/** 列表行：额外给出当前账号能否编辑该行、展示值是否来自真实存在的覆盖行 */
export type ResultEmailTemplateSettingRow = ResultEmailTemplateResolvedSetting & {
  id: number | null;
  editable: boolean;
  hasOverride: boolean;
};

export type ResultEmailTemplateSettingsPayload = {
  rows: ResultEmailTemplateSettingRow[];
  /** 可选模板归属部门：管理员 = 数据库中已出现的部门（可再手填），部门账号 = 仅本部门 */
  departments: string[];
  /** 当前账号的写入范围，UI 据此锁定「模板归属」选择器 */
  scope: DepartmentScope;
};

const requiredFieldLabels: Record<keyof ResultEmailTemplateValues, string> = {
  subjectTemplate: "邮件标题",
  titleTemplate: "邮件主标题",
  subtitleTemplate: "邮件副标题",
  resultBadgeTemplate: "结果标签",
  resultTitleTemplate: "结果标题",
  resultSummaryTemplate: "结果摘要",
  bodyTemplate: "正文文案",
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
    titleTemplate: values.titleTemplate.trim(),
    subtitleTemplate: values.subtitleTemplate.trim(),
    resultBadgeTemplate: values.resultBadgeTemplate.trim(),
    resultTitleTemplate: values.resultTitleTemplate.trim(),
    resultSummaryTemplate: values.resultSummaryTemplate.trim(),
    bodyTemplate: values.bodyTemplate.trim(),
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

function validateResultEmailTemplateValues(
  values: ResultEmailTemplateValues,
  templateKey: string,
) {
  const isRecruitment = templateKey.startsWith("recruitment.");
  const isSocAccepted = templateKey === "soc.result.accepted";
  const requiredKeys = isRecruitment
    ? Object.keys(requiredFieldLabels).filter((key) => key !== "bodyTemplate")
    : [
        "subjectTemplate", "titleTemplate", "subtitleTemplate",
        "resultBadgeTemplate", "resultTitleTemplate", "resultSummaryTemplate",
        "bodyTemplate", "calendarUrl", "contactEmail",
        ...(isSocAccepted ? ["feishuGroupUrl", "feishuGroupName"] : []),
      ];
  for (const [key, label] of Object.entries(requiredFieldLabels).filter(([key]) => requiredKeys.includes(key)) as Array<
    [keyof ResultEmailTemplateValues, string]
  >) {
    if (!values[key]) {
      return { ok: false, message: `${label}不能为空。` };
    }
  }

  if (!values.subjectTemplate.trim()) {
    return { ok: false, message: "邮件标题不能为空。" };
  }

  const validatedUrlFields = isRecruitment
    ? urlFields
    : isSocAccepted
      ? (["calendarUrl", "feishuGroupUrl"] as const)
      : (["calendarUrl"] as const);
  for (const field of validatedUrlFields) {
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

/**
 * 合并解析结果模板：内置默认 → 全局默认行 → 命中的部门覆盖行。
 * 文案字段为空时继续回落到内置默认，避免历史空行渲染出空白邮件。
 */
function mergeResultEmailTemplateSetting(
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
    department: saved.department ?? null,
  };
}

/** 可归属部门：管理员取库中已出现的部门（可再手填），部门账号仅本部门 */
async function listResultTemplateDepartments(scope: DepartmentScope) {
  if (scope.kind === "department") return [scope.department];
  if (scope.kind === "none") return [];

  const rows = await db
    .selectDistinct({ department: emailTemplateSetting.department })
    .from(emailTemplateSetting);
  return rows
    .map((row) => row.department)
    .filter((value): value is string => Boolean(value))
    .sort((a, b) => a.localeCompare(b, "zh-CN"));
}

export async function listEmailTemplateSettings(
  department?: string | null,
  scope?: DepartmentScope,
): Promise<ResultEmailTemplateSettingsPayload> {
  await verifyRole(3);
  const effectiveScope = scope ?? (await getDepartmentScope());
  const readFilter = templateReadFilter(
    emailTemplateSetting.department,
    effectiveScope,
  );
  const savedRows = readFilter
    ? await db.select().from(emailTemplateSetting).where(readFilter)
    : await db.select().from(emailTemplateSetting);

  const target = normalizeDepartmentKey(department);
  const rows = defaultResultEmailTemplateSettings.map((fallback) => {
    const saved = pickTemplateSettingRow(
      savedRows.filter((row) => row.templateKey === fallback.templateKey),
      target,
    );
    return {
      ...mergeResultEmailTemplateSetting(fallback.templateKey, saved),
      id: saved?.id ?? null,
      editable: canEditTemplateRow(effectiveScope, saved?.department ?? null),
      hasOverride: saved !== null && saved.department === target,
    } satisfies ResultEmailTemplateSettingRow;
  });

  return {
    rows,
    departments: await listResultTemplateDepartments(effectiveScope),
    scope: effectiveScope,
  };
}

/**
 * 预览当前账号可见范围内的模板：管理员按入参选部门（缺省全局默认），
 * 部门账号可在全局默认与本部门之间选择、跨部门入参回落本部门，无部门账号只看全局默认。
 */
export async function getResultEmailPreviews(department?: string | null) {
  await verifyRole(3);
  const scope = await getDepartmentScope();
  const requested = normalizeDepartmentKey(department);
  /* 部门账号只能在全局默认（null）与本部门之间取模板，跨部门入参一律回落到本部门 */
  const target =
    scope.kind === "none"
      ? null
      : scope.kind === "department" &&
          requested !== null &&
          requested !== scope.department
        ? scope.department
        : requested;

  const entries = await Promise.all(
    defaultResultEmailTemplateSettings.map(async (fallback) => {
      const setting = await getEmailTemplateSetting(fallback.templateKey, target);
      const rendered = await renderEmailTemplate({
        templateKey: fallback.templateKey as ResultEmailTemplateKey,
        variables: {
          name: "同学",
          flowName: "示例流程",
          setting,
          genericGreeting: true,
        },
        department: target,
      });
      return [fallback.templateKey, rendered.html] as const;
    }),
  );
  return Object.fromEntries(entries) as Record<string, string>;
}

/** 渲染取模板：部门覆盖 → 全局默认 → 内置默认（无任何行时返回内置默认文案） */
export async function getEmailTemplateSetting(
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

export async function updateEmailTemplateSetting(
  templateKey: string,
  values: ResultEmailTemplateValues,
  department?: string | null,
) {
  const session = await verifyRole(3);
  const scope = await getDepartmentScope();
  const target = resolveTemplateEditTarget(scope, department);
  const targetDepartment = target.kind === "department" ? target.department : null;

  const normalized = normalizeResultEmailTemplateValues(values);
  const validation = validateResultEmailTemplateValues(normalized, templateKey);

  if (!validation.ok) {
    return validation;
  }

  try {
    const [existing] = await db
      .select({ id: emailTemplateSetting.id })
      .from(emailTemplateSetting)
      .where(
        and(
          eq(emailTemplateSetting.templateKey, templateKey),
          targetDepartment === null
            ? isNull(emailTemplateSetting.department)
            : eq(emailTemplateSetting.department, targetDepartment),
        ),
      )
      .limit(1);
    let templateSettingId = existing?.id ?? null;

    if (existing) {
      await db
        .update(emailTemplateSetting)
        .set({ ...normalized, department: targetDepartment })
        .where(eq(emailTemplateSetting.id, existing.id));
    } else {
      const [created] = await db
        .insert(emailTemplateSetting)
        .values({
          templateKey,
          department: targetDepartment,
          ...normalized,
        })
        .returning({ id: emailTemplateSetting.id });
      templateSettingId = created?.id ?? null;
    }

    await writeOperationAudit({
      actorId: session.uid,
      actorRole: session.role,
      action: "email.template.update",
      resourceType: "email_template_setting",
      resourceId: templateSettingId,
      department: targetDepartment,
      metadata: {
        templateKey,
        department: targetDepartment,
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
      metadata: { templateKey, department: targetDepartment },
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

/**
 * 删除模板覆盖行，渲染随即回落到全局默认；管理员删除全局默认行后回落到内置默认文案。
 * 目标行不存在时抛「模板未覆盖，无需重置」。
 */
export async function resetEmailTemplateSetting(
  templateKey: string,
  department?: string | null,
) {
  const session = await verifyRole(3);
  const scope = await getDepartmentScope();
  const target = resolveTemplateEditTarget(scope, department);
  const targetDepartment = target.kind === "department" ? target.department : null;

  const [existing] = await db
    .select({ id: emailTemplateSetting.id })
    .from(emailTemplateSetting)
    .where(
      and(
        eq(emailTemplateSetting.templateKey, templateKey),
        targetDepartment === null
          ? isNull(emailTemplateSetting.department)
          : eq(emailTemplateSetting.department, targetDepartment),
      ),
    )
    .limit(1);

  if (!existing) {
    throw new Error("模板未覆盖，无需重置。");
  }

  try {
    const deleted = await db
      .delete(emailTemplateSetting)
      .where(
        and(
          eq(emailTemplateSetting.templateKey, templateKey),
          targetDepartment === null
            ? isNull(emailTemplateSetting.department)
            : eq(emailTemplateSetting.department, targetDepartment),
        ),
      )
      .returning({ id: emailTemplateSetting.id });

    await writeOperationAudit({
      actorId: session.uid,
      actorRole: session.role,
      action: "email.template.reset",
      resourceType: "email_template_setting",
      resourceId: deleted[0]?.id ?? existing.id,
      department: targetDepartment,
      metadata: {
        templateKey,
        department: targetDepartment,
        deletedCount: deleted.length,
      },
    });

    revalidatePath("/dashboard/emails");
    return { ok: true };
  } catch (error) {
    logServerError("email:resetTemplate", error, {
      path: "/dashboard/emails",
      userId: session.uid,
      role: session.role,
      action: "reset-email-template",
      metadata: { templateKey, department: targetDepartment },
    });

    return { ok: false, message: "模板重置失败，请查看错误日志。" };
  }
}
