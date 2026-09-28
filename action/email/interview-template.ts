"use server";

import { normalizeDepartmentKey } from "@/db/schema";
import { verifyRole } from "@/lib/dal";
import {
  DepartmentAccessError,
  getDepartmentScope,
  type DepartmentScope,
} from "@/lib/authz";
import {
  deleteInterviewScheduleTemplateSetting,
  getInterviewNotificationTemplateSetting,
  getInterviewScheduleEmailKindByTemplateKey,
  INTERVIEW_WITHDRAWAL_TEMPLATE_KEY,
  interviewScheduleTemplateKeys,
  listInterviewScheduleTemplateSettings,
  upsertInterviewScheduleTemplateSetting,
  type InterviewNotificationTemplateKey,
  type InterviewScheduleTemplateValues,
} from "@/lib/email/interview-template-settings";
import { renderInterviewScheduleEmailPreview } from "@/lib/email/interview-schedule";
import { renderInterviewWithdrawalEmailPreview } from "@/lib/email-center/interview-withdrawal";
import { resolveTemplateEditTarget } from "@/lib/email-center/template-access";
import { writeOperationAudit } from "@/lib/operation-audit";
import { logServerError } from "@/lib/server-error-log";
import { revalidatePath } from "next/cache";

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

/** 模板入口统一校验：角色 + 部门范围（不在 lib 层做会话校验） */
async function getInterviewTemplateSession() {
  const session = await verifyRole(3);
  const scope = await getDepartmentScope();
  return { ...session, scope };
}

/**
 * 读取目标部门：管理员按传入值（缺省 = 全局默认）；部门账号只允许读本部门的覆盖，
 * 未归属部门的账号（含管理员之外的 role 3）只读全局默认。
 */
function resolveTemplateReadDepartment(
  scope: DepartmentScope,
  requested: unknown,
): string | null {
  const target = normalizeDepartmentKey(requested);
  if (scope.kind === "all") return target;
  if (scope.kind === "department") {
    if (target && target !== scope.department) {
      throw new DepartmentAccessError("无权查看其他部门的邮件模板");
    }
    return scope.department;
  }
  return null;
}

export async function getInterviewScheduleEmailTemplate(department?: string | null) {
  const { scope } = await getInterviewTemplateSession();
  return getInterviewNotificationTemplateSetting(
    interviewScheduleTemplateKeys.created,
    resolveTemplateReadDepartment(scope, department),
  );
}

export async function listInterviewScheduleEmailTemplates(
  department?: string | null,
) {
  const { scope } = await getInterviewTemplateSession();
  return listInterviewScheduleTemplateSettings(department, scope);
}

export async function getInterviewScheduleEmailPreviews(
  department?: string | null,
) {
  const { scope } = await getInterviewTemplateSession();
  const target = resolveTemplateReadDepartment(scope, department);
  const scheduleEntries = await Promise.all(
    Object.values(interviewScheduleTemplateKeys).map(async (templateKey) => {
      const kind = getInterviewScheduleEmailKindByTemplateKey(templateKey);
      return [
        templateKey,
        await renderInterviewScheduleEmailPreview(kind, target),
      ] as const;
    }),
  );
  const withdrawalPreview = await renderInterviewWithdrawalEmailPreview(target);
  return Object.fromEntries([
    ...scheduleEntries,
    [INTERVIEW_WITHDRAWAL_TEMPLATE_KEY, withdrawalPreview],
  ]) as Record<InterviewNotificationTemplateKey, string>;
}

export async function updateInterviewScheduleEmailTemplate(
  templateKey: string,
  values: InterviewScheduleTemplateValues,
  department?: string | null,
) {
  const session = await getInterviewTemplateSession();
  const normalizedTemplateKey = normalizeInterviewTemplateKey(templateKey);
  // 部门账号落到本部门覆盖行，管理员按传入归属（缺省 = 全局默认）；越权在此抛出
  const target = resolveTemplateEditTarget(session.scope, department);
  const targetDepartment = target.kind === "department" ? target.department : null;

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
    const saved = await upsertInterviewScheduleTemplateSetting(
      normalizedTemplateKey,
      normalized,
      targetDepartment,
    );

    await writeOperationAudit({
      actorId: session.uid,
      actorRole: session.role,
      action: "email.template.update",
      resourceType: "email_template_content",
      resourceId: saved.id,
      department: saved.department,
      metadata: {
        templateKey: normalizedTemplateKey,
        department: saved.department,
        mode: saved.mode,
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
      metadata: {
        templateKey: normalizedTemplateKey,
        department: targetDepartment,
      },
    });
    return { ok: false, message: "面试通知模板保存失败，请查看错误日志。" };
  }
}

export async function resetInterviewScheduleEmailTemplate(
  templateKey: string,
  department?: string | null,
) {
  const session = await getInterviewTemplateSession();
  const normalizedTemplateKey = normalizeInterviewTemplateKey(templateKey);
  // 部门账号落到本部门覆盖行，管理员按传入归属（缺省 = 全局默认）；无部门账号在此抛出
  const target = resolveTemplateEditTarget(session.scope, department);
  const targetDepartment = target.kind === "department" ? target.department : null;

  // 删除后回落到下一档：部门行 → 全局默认 → 内置默认
  const deleted = await deleteInterviewScheduleTemplateSetting(
    normalizedTemplateKey,
    targetDepartment,
  );
  if (!deleted) {
    throw new Error("模板未覆盖，无需重置");
  }

  await writeOperationAudit({
    actorId: session.uid,
    actorRole: session.role,
    action: "email.template.reset",
    resourceType: "email_template_content",
    resourceId: null,
    department: targetDepartment,
    metadata: {
      templateKey: normalizedTemplateKey,
      department: targetDepartment,
    },
  });
  revalidatePath("/dashboard/emails");
  return getInterviewNotificationTemplateSetting(
    normalizedTemplateKey,
    targetDepartment,
  );
}
