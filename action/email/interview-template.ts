"use server";

import { db } from "@/db/drizzle";
import { emailTemplateContent } from "@/db/schema";
import { verifyRole } from "@/lib/dal";
import {
  defaultInterviewScheduleTemplateSetting,
  getInterviewScheduleTemplateSetting,
  INTERVIEW_SCHEDULE_TEMPLATE_KEY,
  interviewScheduleTemplateVariables,
  type InterviewScheduleTemplateSetting,
} from "@/lib/email/interview-template-settings";
import { renderInterviewScheduleEmailPreview } from "@/lib/email/interview-schedule";
import { logServerError } from "@/lib/server-error-log";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

type InterviewScheduleTemplateValues = Omit<
  InterviewScheduleTemplateSetting,
  "templateKey"
>;

const hasRequiredVariables = (value: string, variables: readonly string[]) =>
  variables.every((variable) => value.includes(`{${variable}}`));

export async function getInterviewScheduleEmailTemplate() {
  await verifyRole(3);
  return getInterviewScheduleTemplateSetting();
}

export async function getInterviewScheduleEmailPreview() {
  await verifyRole(3);
  return renderInterviewScheduleEmailPreview();
}

export async function updateInterviewScheduleEmailTemplate(
  values: InterviewScheduleTemplateValues,
) {
  const session = await verifyRole(3);

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
  if (!hasRequiredVariables(normalized.subjectTemplate, ["flowName"])) {
    return { ok: false, message: "邮件标题必须保留 {flowName} 变量。" };
  }
  if (
    !hasRequiredVariables(
      normalized.bodyTemplate,
      interviewScheduleTemplateVariables,
    )
  ) {
    return {
      ok: false,
      message:
        "正文说明必须保留候选人、流程、讲师、开始时间、结束时间和会议链接变量。",
    };
  }

  try {
    const [existing] = await db
      .select({ id: emailTemplateContent.id })
      .from(emailTemplateContent)
      .where(eq(emailTemplateContent.templateKey, INTERVIEW_SCHEDULE_TEMPLATE_KEY))
      .limit(1);

    if (existing) {
      await db
        .update(emailTemplateContent)
        .set(normalized)
        .where(eq(emailTemplateContent.templateKey, INTERVIEW_SCHEDULE_TEMPLATE_KEY));
    } else {
      await db.insert(emailTemplateContent).values({
        templateKey: INTERVIEW_SCHEDULE_TEMPLATE_KEY,
        ...normalized,
      });
    }

    revalidatePath("/dashboard/emails");
    return { ok: true };
  } catch (error) {
    logServerError("email:updateInterviewTemplate", error, {
      path: "/dashboard/emails",
      userId: session.uid,
      role: session.role,
      action: "update-interview-email-template",
    });
    return { ok: false, message: "面试通知模板保存失败，请查看错误日志。" };
  }
}

export async function resetInterviewScheduleEmailTemplate() {
  await verifyRole(3);

  await db
    .delete(emailTemplateContent)
    .where(eq(emailTemplateContent.templateKey, INTERVIEW_SCHEDULE_TEMPLATE_KEY));
  revalidatePath("/dashboard/emails");
  return defaultInterviewScheduleTemplateSetting;
}
