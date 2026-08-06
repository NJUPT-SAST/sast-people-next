"use server";

import { getEmailTemplateSetting } from "@/action/email/template";
import { verifyRole } from "@/lib/dal";
import {
  findPeopleUserByStudentId,
  getPeopleUserByLinkId,
} from "@/lib/link/user-lookup";
import { createRenderedTestEmailDelivery } from "@/lib/email-center/delivery";
import { getEmailTemplateDefinition } from "@/lib/email-center/registry";
import type {
  EmailTemplateKey,
  EmailTemplateRenderRequest,
  InterviewEmailTemplateKey,
  ResultEmailTemplateKey,
} from "@/lib/email-center/types";
import { getEducationEmail, normalizeEducationEmailInput } from "@/lib/email/address";
import { writeOperationAudit } from "@/lib/operation-audit";
import { logServerError } from "@/lib/server-error-log";

function getStudentIdFromTestAddress(value: string) {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;
  return normalized.includes("@")
    ? normalized.split("@")[0] || null
    : normalized;
}

export async function sendEmailTest(
  toAddress?: string,
  templateKey: EmailTemplateKey = "recruitment.result.accepted",
  flowName = "SAST 招新",
) {
  let session: Awaited<ReturnType<typeof verifyRole>> | null = null;

  try {
    session = await verifyRole(3);

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
    });
    const result = await createRenderedTestEmailDelivery({
      ...request,
      toAddress: to,
      recipientUserId: targetUser?.id ?? (toAddress ? null : session.uid),
      createdBy: session.uid,
      metadata: {
        templateName: definition.name,
        flowName,
        hasCustomAddress: Boolean(toAddress?.trim()),
      },
      sendImmediately: true,
    });

    await writeOperationAudit({
      actorId: session.uid,
      action: "email.test_send",
      resourceType: "email_delivery",
      resourceId: result.deliveryId,
      metadata: {
        templateKey,
        templateName: definition.name,
        flowName,
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
      metadata: { hasCustomAddress: Boolean(toAddress?.trim()), templateKey, flowName },
    });
    throw error;
  }
}

async function createTestRenderRequest({
  templateKey,
  flowName,
  name,
}: {
  templateKey: EmailTemplateKey;
  flowName: string;
  name: string;
}): Promise<EmailTemplateRenderRequest> {
  if (templateKey === "recruitment.result.accepted" || templateKey === "recruitment.result.rejected") {
    const setting = await getEmailTemplateSetting(templateKey);
    return {
      templateKey: templateKey as ResultEmailTemplateKey,
      variables: {
        name,
        flowName,
        setting,
        genericGreeting: true,
      },
    };
  }

  const startsAt = new Date("2026-06-06T16:00:00+08:00");
  return {
    templateKey: templateKey as InterviewEmailTemplateKey,
    variables: {
      candidateName: name,
      flowName,
      organizerName: "Demo Lecturer",
      startsAt,
      endsAt: new Date(startsAt.getTime() + 30 * 60 * 1000),
      location: "仙林校区大学生活动中心 101",
      note: "请提前准备作品介绍。",
    },
  };
}
