"use server";

import { db } from "@/db/drizzle";
import { user } from "@/db/schema";
import { verifyRole } from "@/lib/dal";
import { getEducationEmail, normalizeEducationEmailInput } from "@/lib/email/address";
import { logServerError } from "@/lib/server-error-log";
import { sendRawEmail } from "@/queue/sendEmail";
import { eq } from "drizzle-orm";

export async function sendEmailTest(toAddress?: string) {
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
    const result = await sendRawEmail({
      to,
      subject: "SAST 邮件发送测试",
      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.7;">
          <p>${currentUser.name}，你好：</p>
          <p>这是一封 SAST 人员管理平台的测试邮件。</p>
          <p>如果你收到这封邮件，说明当前邮件账号可以正常发送。</p>
        </div>
      `,
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
      metadata: { hasCustomAddress: Boolean(toAddress?.trim()) },
    });
    throw error;
  }
}
