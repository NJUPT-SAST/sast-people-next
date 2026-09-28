import "server-only";

import { db } from "@/db/drizzle";
import { emailTemplateContent, normalizeDepartmentKey } from "@/db/schema";
import { getDepartmentScope, type DepartmentScope } from "@/lib/authz";
import {
  canEditTemplateRow,
  pickTemplateSettingRow,
  templateReadFilter,
} from "@/lib/email-center/template-access";
import { renderTemplateText } from "@/lib/email/template-settings";
import { and, eq, inArray, isNull } from "drizzle-orm";

export const INTERVIEW_SCHEDULE_TEMPLATE_KEY = "interview.schedule";
export const interviewScheduleTemplateKeys = {
  created: "interview.schedule.created",
  rescheduled: "interview.schedule.rescheduled",
  cancelled: "interview.schedule.cancelled",
} as const;

export const INTERVIEW_WITHDRAWAL_TEMPLATE_KEY = "interview.application.withdrawn";

export type InterviewScheduleEmailKind =
  keyof typeof interviewScheduleTemplateKeys;

export type InterviewScheduleTemplateKey =
  (typeof interviewScheduleTemplateKeys)[InterviewScheduleEmailKind];

export type InterviewScheduleTemplateSetting = {
  templateKey: string;
  subjectTemplate: string;
  titleTemplate: string;
  bodyTemplate: string;
  footerText: string;
};

export type InterviewNotificationTemplateKey =
  | InterviewScheduleTemplateKey
  | typeof INTERVIEW_WITHDRAWAL_TEMPLATE_KEY;

export type InterviewNotificationTemplateSetting = InterviewScheduleTemplateSetting;

/** 解析后的模板：`department` 为命中覆盖行的归属部门，NULL = 落到全局默认 / 内置默认 */
export type InterviewScheduleTemplateResolvedSetting =
  InterviewScheduleTemplateSetting & {
    department: string | null;
  };

/** 列表行：额外给出当前账号能否编辑该行（全局默认仅管理员可编辑） */
export type InterviewScheduleTemplateListRow =
  InterviewScheduleTemplateResolvedSetting & {
    editable: boolean;
    /** 展示值是否来自真实存在的覆盖行；false = 正在回落到全局默认 / 内置默认 */
    hasOverride: boolean;
  };

export type InterviewScheduleTemplateSettingsPayload = {
  rows: InterviewScheduleTemplateListRow[];
  /** 可选的模板归属部门：管理员 = 数据库中已出现的部门，部门账号 = 仅本部门 */
  departments: string[];
  /** 当前账号的写入范围，UI 据此锁定「模板归属」选择器 */
  scope: DepartmentScope;
};

/** 面试模板写入的四个文案字段 */
export type InterviewScheduleTemplateValues = {
  subjectTemplate: string;
  titleTemplate: string;
  bodyTemplate: string;
  footerText: string;
};

export const defaultInterviewWithdrawalTemplateSetting: InterviewScheduleTemplateSetting = {
  templateKey: INTERVIEW_WITHDRAWAL_TEMPLATE_KEY,
  subjectTemplate: "{flowName} 面试报名退回通知",
  titleTemplate: "报名已退回",
  bodyTemplate:
    "{candidateName} 同学，你好。你的 {flowName} 面试报名已被退回，请根据说明补充或调整报名信息后重新报名。",
  footerText: "南京邮电大学大学生科学技术协会",
};


export const defaultInterviewScheduleTemplateSettings: Record<
  InterviewScheduleTemplateKey,
  InterviewScheduleTemplateSetting
> = {
  "interview.schedule.created": {
    templateKey: "interview.schedule.created",
    subjectTemplate: "{flowName} 面试预约通知",
    titleTemplate: "面试预约已确认",
    bodyTemplate:
      "{candidateName} 同学，你好。{flowName} 的线下面试安排已确认，请查看下方的面试时间安排并按时到达。",
    footerText: "南京邮电大学大学生科学技术协会",
  },
  "interview.schedule.rescheduled": {
    templateKey: "interview.schedule.rescheduled",
    subjectTemplate: "{flowName} 面试改约通知",
    titleTemplate: "面试时间已调整",
    bodyTemplate:
      "{candidateName} 同学，你的 {flowName} 面试时间已调整，请以本邮件中的新时间为准。",
    footerText: "南京邮电大学大学生科学技术协会",
  },
  "interview.schedule.cancelled": {
    templateKey: "interview.schedule.cancelled",
    subjectTemplate: "{flowName} 面试取消通知",
    titleTemplate: "面试预约已取消",
    bodyTemplate:
      "{candidateName} 同学，你的 {flowName} 面试预约已取消，后续安排请关注新的通知。",
    footerText: "南京邮电大学大学生科学技术协会",
  },
};

export const defaultInterviewScheduleTemplateSetting =
  defaultInterviewScheduleTemplateSettings["interview.schedule.created"];

export const interviewScheduleTemplateVariables = [
  "candidateName",
  "flowName",
  "organizerName",
  "startsAt",
  "endsAt",
  "location",
] as const;

/** email_template_content 里可能出现的面试模板 key（含历史 legacy key） */
const interviewTemplateContentKeys: readonly string[] = [
  ...Object.values(interviewScheduleTemplateKeys),
  INTERVIEW_SCHEDULE_TEMPLATE_KEY,
  INTERVIEW_WITHDRAWAL_TEMPLATE_KEY,
];

type TemplateContentRow = {
  templateKey: string;
  department: string | null;
};

function getTemplateKeyByKind(kind: InterviewScheduleEmailKind) {
  return interviewScheduleTemplateKeys[kind];
}

/** legacy `interview.schedule` 只作为 created 模板的旧存储位置回退 */
function getContentKeysOfTemplate(templateKey: InterviewNotificationTemplateKey) {
  return templateKey === interviewScheduleTemplateKeys.created
    ? [templateKey, INTERVIEW_SCHEDULE_TEMPLATE_KEY]
    : [templateKey];
}

/** 候选行排序：新 key 在前、legacy key 在后，`pickTemplateSettingRow` 取首个命中 */
function orderCandidateRows<T extends TemplateContentRow>(
  rows: T[],
  templateKey: InterviewNotificationTemplateKey,
) {
  return getContentKeysOfTemplate(templateKey).flatMap((contentKey) =>
    rows.filter((row) => row.templateKey === contentKey),
  );
}

export function getInterviewScheduleTemplateDefault(
  templateKey: InterviewScheduleTemplateKey,
) {
  return defaultInterviewScheduleTemplateSettings[templateKey];
}

export function getInterviewScheduleEmailKindByTemplateKey(
  templateKey: string,
): InterviewScheduleEmailKind {
  if (templateKey === interviewScheduleTemplateKeys.rescheduled) {
    return "rescheduled";
  }
  if (templateKey === interviewScheduleTemplateKeys.cancelled) {
    return "cancelled";
  }
  return "created";
}

export function getInterviewNotificationTemplateDefault(
  templateKey: InterviewNotificationTemplateKey,
) {
  return templateKey === INTERVIEW_WITHDRAWAL_TEMPLATE_KEY
    ? defaultInterviewWithdrawalTemplateSetting
    : defaultInterviewScheduleTemplateSettings[templateKey];
}

/**
 * 解析模板：部门覆盖 → 全局默认 → 内置默认。
 * 合并顺序为 内置默认 → legacy 回退 → 命中的覆盖行，保证任何一档缺失都能回落。
 */
export async function getInterviewNotificationTemplateSetting(
  templateKey: InterviewNotificationTemplateKey,
  department?: string | null,
): Promise<InterviewScheduleTemplateResolvedSetting> {
  const rows = await db
    .select()
    .from(emailTemplateContent)
    .where(
      inArray(
        emailTemplateContent.templateKey,
        getContentKeysOfTemplate(templateKey),
      ),
    );
  const saved = pickTemplateSettingRow(
    orderCandidateRows(rows, templateKey),
    department,
  );

  return {
    ...getInterviewNotificationTemplateDefault(templateKey),
    ...(saved ?? null),
    templateKey,
    department: saved?.department ?? null,
  };
}

/** 预览 / 发送共用的模板解析入口 */
export async function getInterviewScheduleTemplateSetting(
  kind: InterviewScheduleEmailKind = "created",
  department?: string | null,
) {
  return getInterviewNotificationTemplateSetting(getTemplateKeyByKind(kind), department);
}

export async function getInterviewWithdrawalTemplateSetting(
  department?: string | null,
) {
  return getInterviewNotificationTemplateSetting(
    INTERVIEW_WITHDRAWAL_TEMPLATE_KEY,
    department,
  );
}

/** 可归属部门：管理员取库中已出现的部门（可再手填），部门账号仅本部门 */
async function listTemplateDepartments(scope: DepartmentScope) {
  if (scope.kind === "department") return [scope.department];
  if (scope.kind === "none") return [];

  const rows = await db
    .selectDistinct({ department: emailTemplateContent.department })
    .from(emailTemplateContent);
  return rows
    .map((row) => row.department)
    .filter((value): value is string => Boolean(value))
    .sort((a, b) => a.localeCompare(b, "zh-CN"));
}

export async function listInterviewScheduleTemplateSettings(
  department?: string | null,
  scope?: DepartmentScope,
): Promise<InterviewScheduleTemplateSettingsPayload> {
  const effectiveScope = scope ?? (await getDepartmentScope());
  // 读路径过滤：部门账号只能看到全局默认与本部门覆盖，避免列表泄露其他部门的文案
  const rows = await db
    .select()
    .from(emailTemplateContent)
    .where(
      and(
        inArray(emailTemplateContent.templateKey, [...interviewTemplateContentKeys]),
        templateReadFilter(emailTemplateContent.department, effectiveScope),
      ),
    );

  const templateKeys: InterviewNotificationTemplateKey[] = [
    ...Object.values(interviewScheduleTemplateKeys),
    INTERVIEW_WITHDRAWAL_TEMPLATE_KEY,
  ];
  const target = normalizeDepartmentKey(department);

  const settingRows = templateKeys.map((templateKey) => {
    const saved = pickTemplateSettingRow(
      orderCandidateRows(rows, templateKey),
      target,
    );
    return {
      ...getInterviewNotificationTemplateDefault(templateKey),
      ...(saved ?? null),
      templateKey,
      department: saved?.department ?? null,
      hasOverride: saved !== null && saved.department === target,
      editable: canEditTemplateRow(effectiveScope, saved?.department ?? null),
    } satisfies InterviewScheduleTemplateListRow;
  });

  return {
    rows: settingRows,
    departments: await listTemplateDepartments(effectiveScope),
    scope: effectiveScope,
  };
}

/**
 * 写入模板行：同一 `(template_key, department)` 存在则更新，否则新增。
 * `department` 为 NULL 表示全局默认行。
 */
export async function upsertInterviewScheduleTemplateSetting(
  templateKey: InterviewNotificationTemplateKey,
  values: InterviewScheduleTemplateValues,
  department: string | null,
): Promise<{ id: number | null; mode: "update" | "create"; department: string | null }> {
  const target = normalizeDepartmentKey(department);
  const [existing] = await db
    .select({ id: emailTemplateContent.id })
    .from(emailTemplateContent)
    .where(
      and(
        eq(emailTemplateContent.templateKey, templateKey),
        target === null
          ? isNull(emailTemplateContent.department)
          : eq(emailTemplateContent.department, target),
      ),
    )
    .limit(1);

  if (existing) {
    await db
      .update(emailTemplateContent)
      .set({ ...values, department: target })
      .where(eq(emailTemplateContent.id, existing.id));
    return { id: existing.id, mode: "update", department: target };
  }

  const [created] = await db
    .insert(emailTemplateContent)
    .values({ templateKey, department: target, ...values })
    .returning({ id: emailTemplateContent.id });
  return { id: created?.id ?? null, mode: "create", department: target };
}

/** 删除模板行：`department` 为 NULL 删全局默认行，否则删该部门覆盖行 */
export async function deleteInterviewScheduleTemplateSetting(
  templateKey: InterviewNotificationTemplateKey,
  department: string | null,
): Promise<boolean> {
  const deleted = await db
    .delete(emailTemplateContent)
    .where(
      and(
        eq(emailTemplateContent.templateKey, templateKey),
        department === null
          ? isNull(emailTemplateContent.department)
          : eq(emailTemplateContent.department, department),
      ),
    )
    .returning({ id: emailTemplateContent.id });

  return deleted.length > 0;
}

export function renderInterviewScheduleTemplateText(
  template: string,
  variables: Record<(typeof interviewScheduleTemplateVariables)[number], string>,
) {
  return renderTemplateText(template, variables);
}

export const renderInterviewWithdrawalTemplateText = renderTemplateText;
