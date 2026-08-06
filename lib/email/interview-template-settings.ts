import "server-only";

import { db } from "@/db/drizzle";
import { emailTemplateContent } from "@/db/schema";
import { renderTemplateText } from "@/lib/email/template-settings";
import { eq, inArray } from "drizzle-orm";

export const INTERVIEW_SCHEDULE_TEMPLATE_KEY = "interview.schedule";
export const interviewScheduleTemplateKeys = {
  created: "interview.schedule.created",
  rescheduled: "interview.schedule.rescheduled",
  cancelled: "interview.schedule.cancelled",
} as const;

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

export const defaultInterviewScheduleTemplateSettings: Record<
  InterviewScheduleTemplateKey,
  InterviewScheduleTemplateSetting
> = {
  "interview.schedule.created": {
    templateKey: "interview.schedule.created",
    subjectTemplate: "{flowName} 面试预约通知",
    titleTemplate: "面试预约已确认",
    bodyTemplate:
      "{candidateName} 同学，你好。{flowName} 的线下面试安排已确认，请按时到达下方地点参加。",
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

function getTemplateKeyByKind(kind: InterviewScheduleEmailKind) {
  return interviewScheduleTemplateKeys[kind];
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

export async function listInterviewScheduleTemplateSettings() {
  const templateKeys = Object.values(interviewScheduleTemplateKeys);
  const rows = await db
    .select()
    .from(emailTemplateContent)
    .where(inArray(emailTemplateContent.templateKey, [
      ...templateKeys,
      INTERVIEW_SCHEDULE_TEMPLATE_KEY,
    ]));
  const savedByKey = new Map(rows.map((row) => [row.templateKey, row]));
  const legacyCreated = savedByKey.get(INTERVIEW_SCHEDULE_TEMPLATE_KEY);

  return templateKeys.map((templateKey) => ({
    ...defaultInterviewScheduleTemplateSettings[templateKey],
    ...(templateKey === interviewScheduleTemplateKeys.created
      ? legacyCreated
      : null),
    ...savedByKey.get(templateKey),
    templateKey,
  }));
}

export async function getInterviewScheduleTemplateSetting(
  kind: InterviewScheduleEmailKind = "created",
) {
  const templateKey = getTemplateKeyByKind(kind);
  const [saved] = await db
    .select()
    .from(emailTemplateContent)
    .where(eq(emailTemplateContent.templateKey, templateKey))
    .limit(1);
  const [legacyCreated] =
    !saved && kind === "created"
      ? await db
          .select()
          .from(emailTemplateContent)
          .where(eq(emailTemplateContent.templateKey, INTERVIEW_SCHEDULE_TEMPLATE_KEY))
          .limit(1)
      : [];

  return {
    ...defaultInterviewScheduleTemplateSettings[templateKey],
    ...(legacyCreated ?? null),
    ...saved,
    templateKey,
  };
}

export function renderInterviewScheduleTemplateText(
  template: string,
  variables: Record<(typeof interviewScheduleTemplateVariables)[number], string>,
) {
  return renderTemplateText(template, variables);
}
