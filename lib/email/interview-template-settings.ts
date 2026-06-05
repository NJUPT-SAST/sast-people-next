import "server-only";

import { db } from "@/db/drizzle";
import { emailTemplateContent } from "@/db/schema";
import { renderTemplateText } from "@/lib/email/template-settings";
import { eq } from "drizzle-orm";

export const INTERVIEW_SCHEDULE_TEMPLATE_KEY = "interview.schedule";

export type InterviewScheduleTemplateSetting = {
  templateKey: string;
  subjectTemplate: string;
  titleTemplate: string;
  bodyTemplate: string;
  footerText: string;
};

export const defaultInterviewScheduleTemplateSetting: InterviewScheduleTemplateSetting = {
  templateKey: INTERVIEW_SCHEDULE_TEMPLATE_KEY,
  subjectTemplate: "{flowName} 面试预约通知",
  titleTemplate: "面试预约通知",
  bodyTemplate: "{candidateName} 同学，你已预约 {flowName} 的面试，请按时通过下方会议链接参加。",
  footerText: "南京邮电大学大学生科学技术协会",
};

export const interviewScheduleTemplateVariables = [
  "candidateName",
  "flowName",
  "organizerName",
  "startsAt",
  "endsAt",
  "meetingLink",
] as const;

export async function getInterviewScheduleTemplateSetting() {
  const [saved] = await db
    .select()
    .from(emailTemplateContent)
    .where(eq(emailTemplateContent.templateKey, INTERVIEW_SCHEDULE_TEMPLATE_KEY))
    .limit(1);

  return {
    ...defaultInterviewScheduleTemplateSetting,
    ...saved,
  };
}

export function renderInterviewScheduleTemplateText(
  template: string,
  variables: Record<(typeof interviewScheduleTemplateVariables)[number], string>,
) {
  return renderTemplateText(template, variables);
}
