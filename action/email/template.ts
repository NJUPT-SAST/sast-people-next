"use server";

import { db } from "@/db/drizzle";
import { emailTemplateSetting } from "@/db/schema";
import { verifyRole } from "@/lib/dal";
import { logServerError } from "@/lib/server-error-log";
import {
  defaultResultEmailTemplateSettings,
  type ResultEmailTemplateSetting,
} from "@/lib/email/template-settings";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

export async function listEmailTemplateSettings() {
  await verifyRole(3);

  const rows = await db.select().from(emailTemplateSetting);
  return defaultResultEmailTemplateSettings.map((fallback) => {
    const saved = rows.find((item) => item.templateKey === fallback.templateKey);
    return {
      ...fallback,
      ...saved,
    };
  });
}

export async function getEmailTemplateSetting(templateKey: string) {
  const [saved] = await db
    .select()
    .from(emailTemplateSetting)
    .where(eq(emailTemplateSetting.templateKey, templateKey))
    .limit(1);

  return (
    saved ??
    defaultResultEmailTemplateSettings.find(
      (item) => item.templateKey === templateKey,
    )!
  );
}

export async function updateEmailTemplateSetting(
  templateKey: string,
  values: Omit<ResultEmailTemplateSetting, "templateKey">,
) {
  const session = await verifyRole(3);

  try {
    const [existing] = await db
      .select({ id: emailTemplateSetting.id })
      .from(emailTemplateSetting)
      .where(eq(emailTemplateSetting.templateKey, templateKey))
      .limit(1);

    if (existing) {
      await db
        .update(emailTemplateSetting)
        .set(values)
        .where(eq(emailTemplateSetting.templateKey, templateKey));
    } else {
      await db.insert(emailTemplateSetting).values({
        templateKey,
        ...values,
      });
    }

    revalidatePath("/dashboard/emails");
    return { ok: true };
  } catch (error) {
    logServerError("email:updateTemplate", error, {
      path: "/dashboard/emails",
      userId: session.uid,
      role: session.role,
      action: "update-email-template",
      metadata: { templateKey },
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
