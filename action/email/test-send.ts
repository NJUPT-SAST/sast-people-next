"use server";

import { readResultEmailTemplateSetting } from "@/lib/email-center/template-resolution";
import { getDepartmentScope } from "@/lib/authz";
import { verifyRole } from "@/lib/dal";
import { resolveTemplateEditTarget } from "@/lib/email-center/template-access";
import {
  findPeopleUserByStudentId,
  getPeopleUserByLinkId,
} from "@/lib/link/user-lookup";
import { createRenderedTestEmailDelivery } from "@/lib/email-center/delivery";
import { getEmailTemplateDefinition } from "@/lib/email-center/registry";
import type {
  EmailTemplateKey,
  EmailTemplateRenderRequest,
  InterviewScheduleEmailTemplateKey,
  ResultEmailTemplateKey,
} from "@/lib/email-center/types";
import { getEducationEmail, normalizeEducationEmailInput } from "@/lib/email/address";
import { departmentLabel } from "@/const/department";
import { writeOperationAudit } from "@/lib/operation-audit";
import { logServerError } from "@/lib/server-error-log";
import { getResultEmailFlowKind } from "@/lib/email/result-email";

function getStudentIdFromTestAddress(value: string) {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;
  return normalized.includes("@")
    ? normalized.split("@")[0] || null
    : normalized;
}

export type SendEmailTestInput = {
  toAddress?: string;
  flowName?: string;
};

/**
 * 发送测试邮件。模板归属部门由 `resolveTemplateEditTarget` 决定：
 * 管理员可指定部门（缺省为全局默认），部门账号一律锁定本部门。
 */
export async function sendEmailTest(
  templateKey: EmailTemplateKey = "recruitment.result.accepted",
  input: SendEmailTestInput = {},
  department?: string | null,
) {
  const toAddress = input.toAddress;
  const flowName = input.flowName ?? "SAST 招新";
  let session: { uid: number; role: number; name: string } | null = null;
  let targetDepartment: string | null = null;

  try {
    session = await verifyRole(3);
    const scope = await getDepartmentScope();
    const target = resolveTemplateEditTarget(scope, department);
    targetDepartment = target.kind === "department" ? target.department : null;

    const currentUser = await getPeopleUserByLinkId(session.uid);

    if (!toAddress?.trim() && !currentUser?.studentId) {
      throw new Error("当前账号没有学号，请输入测试收件地址。");
    }

    const to = toAddress
      ? normalizeEducationEmailInput(toAddress)
      : getEducationEmail(currentUser?.studentId);
    const targetStudentId = toAddress
      ? getStudentIdFromTestAddress(toAddress)
      : currentUser?.studentId;
    const targetUser = targetStudentId
      ? await findPeopleUserByStudentId(targetStudentId)
      : null;
    const definition = getEmailTemplateDefinition(templateKey);
    if (!definition) {
      throw new Error("测试邮件模板不存在。");
    }

    const request = await createTestRenderRequest({
      templateKey,
      flowName,
      name: targetUser?.name ?? currentUser?.name ?? session.name ?? "同学",
      // The test send shows whoever is sending it, so a withdrawal test shows
      // the same 讲师 / 管理员 line the real email will.
      operatorName: session.name,
      operatorRole: session.role,
      department: targetDepartment,
    });
    const result = await createRenderedTestEmailDelivery({
      ...request,
      toAddress: to,
      recipientUserId: targetUser?.id ?? (toAddress ? null : session.uid),
      createdBy: session.uid,
      metadata: {
        templateName: definition.name,
        flowName,
        department: targetDepartment,
        hasCustomAddress: Boolean(toAddress?.trim()),
      },
      sendImmediately: true,
    });

    await writeOperationAudit({
      actorId: session.uid,
      actorRole: session.role,
      action: "email.test_send",
      resourceType: "email_delivery",
      resourceId: result.deliveryId,
      department: targetDepartment,
      metadata: {
        templateKey,
        templateName: definition.name,
        flowName,
        department: targetDepartment,
        hasCustomAddress: Boolean(toAddress?.trim()),
      },
    });

    return {
      ok: true,
      to,
      messageId: result.messageId,
    };
  } catch (error) {
    logServerError("email:test", error, {
      path: "/dashboard/emails",
      userId: session?.uid ?? null,
      role: session?.role ?? null,
      action: "send-test-email",
      metadata: { hasCustomAddress: Boolean(toAddress?.trim()), templateKey, flowName, department: targetDepartment },
    });
    throw error;
  }
}

async function createTestRenderRequest({
  templateKey,
  flowName,
  name,
  operatorName,
  operatorRole,
  department,
}: {
  templateKey: EmailTemplateKey;
  flowName: string;
  name: string;
  operatorName: string;
  operatorRole: number;
  department: string | null;
}): Promise<EmailTemplateRenderRequest> {
  if (getEmailTemplateDefinition(templateKey)?.category === "result") {
    /* 内部读取：写入目标已由 resolveTemplateEditTarget 校验，这里不需要再走 action */
    const setting = await readResultEmailTemplateSetting(templateKey, department);
    const [flowKind] = templateKey.split(".");
    /* 办公类模板按轮次区分；测试发送沿用模板键里的轮次 */
    const round =
      flowKind === "office_round2" ? 2 : flowKind === "office_round1" ? 1 : null;
    return {
      templateKey: templateKey as ResultEmailTemplateKey,
      variables: {
        name,
        flowName,
        round,
        department: departmentLabel(department, "办公室"),
        groupNumber: "123456789",
        setting,
        flowKind: getResultEmailFlowKind(flowKind, round),
        genericGreeting: false,
      },
      department,
    };
  }

  if (templateKey === "interview.application.withdrawn") {
    return {
      templateKey,
      variables: {
        candidateName: name,
        flowName,
        reason: "请补充作品集后重新报名。",
        operatorName,
        operatorRole,
      },
      department,
    };
  }

  const startsAt = new Date("2026-06-06T16:00:00+08:00");
  return {
    templateKey: templateKey as InterviewScheduleEmailTemplateKey,
    variables: {
      candidateName: name,
      flowName,
      organizerName: "李四",
      startsAt,
      endsAt: new Date(startsAt.getTime() + 30 * 60 * 1000),
      location: "仙林校区大学生活动中心 101",
      note: "请提前准备作品介绍。",
    },
    department,
  };
}
