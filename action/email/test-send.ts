"use server";

import { db } from "@/db/drizzle";
import { user } from "@/db/schema";
import { getEmailTemplateSetting } from "@/action/email/template";
import { verifyRole } from "@/lib/dal";
import {
  getResultEmailTemplateKey,
  renderResultEmail,
  renderResultEmailSubject,
} from "@/lib/email/result-email";
import { getEducationEmail, normalizeEducationEmailInput } from "@/lib/email/address";
import { logServerError } from "@/lib/server-error-log";
import { sendRawEmail } from "@/queue/sendEmail";
import { eq } from "drizzle-orm";

function getStudentIdFromTestAddress(value: string) {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;
  return normalized.includes("@")
    ? normalized.split("@")[0] || null
    : normalized;
}

export async function sendEmailTest(
  toAddress?: string,
  accept = true,
  flowName = "SAST 招新",
) {
  let session: Awaited<ReturnType<typeof verifyRole>> | null = null;

  try {
    session = await verifyRole(3);

    const [currentUser] = await db
      .select({
        name: user.name,
        studentId: user.studentId,
      })
      .from(user)
      .where(eq(user.id, session.uid))
      .limit(1);

    if (!currentUser?.studentId) {
      throw new Error("当前账号没有学号，无法生成测试收件地址。");
    }

    const to = toAddress
      ? normalizeEducationEmailInput(toAddress)
      : getEducationEmail(currentUser.studentId);
    const targetStudentId = toAddress
      ? getStudentIdFromTestAddress(toAddress)
      : currentUser.studentId;
    const [targetUser] = targetStudentId
      ? await db
          .select({ name: user.name })
          .from(user)
          .where(eq(user.studentId, targetStudentId))
          .limit(1)
      : [];
    const templateSetting = await getEmailTemplateSetting(
      getResultEmailTemplateKey(accept),
    );
    const subject = renderResultEmailSubject(flowName, templateSetting);
    const html = await renderResultEmail({
      name: targetUser?.name ?? currentUser.name,
      flowName,
      accept,
      setting: templateSetting,
    });
    const result = await sendRawEmail({
      to,
      subject,
      html,
    });

    return {
      ok: true,
      to,
      messageId: result.messageId ?? null,
    };
  } catch (error) {
    logServerError("email:test", error, {
      path: "/dashboard/emails",
      userId: session?.uid ?? null,
      role: session?.role ?? null,
      action: "send-test-email",
      metadata: { hasCustomAddress: Boolean(toAddress?.trim()), accept, flowName },
    });
    throw error;
  }
}
