"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod/v4";

import { verifyRole, type VerifiedSession } from "@/lib/dal";
import {
  cancelCustomEmailSchedule,
  deleteCustomEmailMessage,
  getCustomEmailMessageDetail,
  previewCustomEmail,
  retryCustomMessage,
  saveCustomEmailMessage,
  searchCustomEmailRecipients,
  sendCustomMessageById,
  type CustomEmailMessageDetail,
  type CustomEmailRecipientSearchResult,
} from "@/lib/email-center/custom-message";
import {
  hasMeaningfulEmailBody,
  parseCustomEmailSchedule,
} from "@/lib/email-center/custom-message-helpers";
import { MissingLinkAdminAccessTokenError } from "@/lib/link/session";
import { writeOperationAudit } from "@/lib/operation-audit";
import { logServerError } from "@/lib/server-error-log";

type CustomEmailActionResultSuccess<T> = T extends undefined
  ? { ok: true; data?: undefined }
  : { ok: true; data: T };

export type CustomEmailActionResult<T = undefined> =
  | CustomEmailActionResultSuccess<T>
  | { ok: false; message: string };

export type CustomEmailComposeInput = {
  id?: number | null;
  subject: string;
  bodyHtml: string;
  recipientUserIds: number[];
  manualAddresses: string[];
  scheduledAt?: string | null;
};

const composeSchema = z.object({
  id: z.number().int().positive().nullable().optional(),
  subject: z.string().max(255).default(""),
  bodyHtml: z.string().max(200_000).default(""),
  recipientUserIds: z
    .array(z.number().int().positive())
    .max(500, "单次最多选择 500 位 Link 用户")
    .default([]),
  manualAddresses: z
    .array(z.string().trim().email("手填邮箱格式不正确"))
    .max(100, "手填邮箱最多 100 个")
    .default([]),
  scheduledAt: z.string().trim().max(32).nullable().optional(),
});

const idSchema = z.number().int().positive();

const searchSchema = z.object({
  keyword: z.string().trim().max(100).default(""),
  page: z.number().int().positive().default(1),
});

function failure(message: string): CustomEmailActionResult<never> {
  return { ok: false, message };
}

function assertReadyToSend(parsed: z.infer<typeof composeSchema>) {
  if (!parsed.subject.trim()) {
    throw new Error("请填写邮件主题");
  }
  if (!hasMeaningfulEmailBody(parsed.bodyHtml)) {
    throw new Error("请填写邮件正文");
  }
  if (
    parsed.recipientUserIds.length === 0 &&
    parsed.manualAddresses.length === 0
  ) {
    throw new Error("请至少选择一位收件人");
  }
}



export async function searchCustomEmailRecipientsAction(input: {
  keyword?: string;
  page?: number;
}): Promise<
  CustomEmailActionResult<
    CustomEmailRecipientSearchResult
  >
> {
  try {
    await verifyRole(3);
    const parsed = searchSchema.safeParse(input);
    if (!parsed.success) {
      return failure(parsed.error.issues[0]?.message ?? "搜索参数无效");
    }
    const data = await searchCustomEmailRecipients(parsed.data);
    return { ok: true, data };
  } catch (error) {
    if (error instanceof MissingLinkAdminAccessTokenError) {
      return failure("Link 授权已失效，请重新登录后再试");
    }
    logServerError("email:custom:searchRecipients", error, {
      path: "/dashboard/emails",
      action: "search-custom-email-recipients",
    });
    return failure("搜索 Link 用户失败，请稍后重试");
  }
}

export async function previewCustomEmailDraftAction(input: {
  subject: string;
  bodyHtml: string;
}): Promise<CustomEmailActionResult<{ html: string }>> {
  try {
    await verifyRole(3);
    const parsed = composeSchema.safeParse({
      subject: input.subject,
      bodyHtml: input.bodyHtml,
      recipientUserIds: [],
      manualAddresses: [],
    });
    if (!parsed.success) {
      return failure(parsed.error.issues[0]?.message ?? "正文格式不正确");
    }
    const rendered = await previewCustomEmail({
      subject: parsed.data.subject,
      bodyHtml: parsed.data.bodyHtml,
    });
    return { ok: true, data: { html: rendered.html } };
  } catch (error) {
    logServerError("email:custom:preview", error, {
      path: "/dashboard/emails",
      action: "preview-custom-email",
    });
    return failure(
      error instanceof Error ? error.message : "预览生成失败，请稍后重试",
    );
  }
}

export async function saveCustomEmailAction(
  input: CustomEmailComposeInput & {
    mode: "draft" | "schedule" | "send";
  },
): Promise<
  CustomEmailActionResult<{
    id: number;
    status: string;
    queuedCount?: number;
  }>
> {
  let session: VerifiedSession | null = null;
  try {
    session = await verifyRole(3);
    const parsed = composeSchema.safeParse(input);
    if (!parsed.success) {
      return failure(parsed.error.issues[0]?.message ?? "邮件内容无效");
    }

    if (input.mode === "schedule" || input.mode === "send") {
      assertReadyToSend(parsed.data);
    }

    const scheduledAt =
      input.mode === "schedule"
        ? parseCustomEmailSchedule(parsed.data.scheduledAt)
        : null;

    const saved = await saveCustomEmailMessage({
      session,
      id: parsed.data.id,
      subject: parsed.data.subject,
      bodyHtml: parsed.data.bodyHtml,
      recipientUserIds: parsed.data.recipientUserIds,
      manualAddresses: parsed.data.manualAddresses,
      scheduledAt,
    });

    let status = input.mode === "schedule" ? "scheduled" : "draft";
    let queuedCount: number | undefined;

    if (input.mode === "send") {
      const result = await sendCustomMessageById(saved.id, {
        triggeredBy: session.uid,
      });
      status = result.status ?? "sending";
      queuedCount = result.queuedCount;
    }

    await writeOperationAudit({
      actorId: session.uid,
      actorRole: session.realRole,
      action:
        input.mode === "send"
          ? "email.custom.send"
          : input.mode === "schedule"
            ? "email.custom.schedule"
            : "email.custom.draft_save",
      resourceType: "email_custom_message",
      resourceId: saved.id,
      department: session.department,
      metadata: {
        mode: input.mode,
        subject: parsed.data.subject.slice(0, 255),
        recipientCount:
          parsed.data.recipientUserIds.length +
          parsed.data.manualAddresses.length,
        scheduledAt: scheduledAt?.toISOString() ?? null,
        queuedCount: queuedCount ?? null,
      },
    });

    revalidatePath("/dashboard/emails");
    return { ok: true, data: { id: saved.id, status, queuedCount } };
  } catch (error) {
    logServerError("email:custom:save", error, {
      path: "/dashboard/emails",
      userId: session?.uid ?? null,
      role: session?.role ?? null,
      action: `save-custom-email-${input.mode}`,
    });
    return failure(
      error instanceof Error ? error.message : "保存自定义邮件失败",
    );
  }
}

export async function getCustomEmailMessageAction(
  id: number,
): Promise<
  CustomEmailActionResult<
    CustomEmailMessageDetail
  >
> {
  try {
    const session = await verifyRole(3);
    const parsed = idSchema.safeParse(id);
    if (!parsed.success) return failure("邮件 ID 无效");
    const data = await getCustomEmailMessageDetail(parsed.data, session);
    return { ok: true, data };
  } catch (error) {
    logServerError("email:custom:load", error, {
      path: "/dashboard/emails",
      action: "load-custom-email",
      metadata: { id },
    });
    return failure(
      error instanceof Error ? error.message : "加载自定义邮件失败",
    );
  }
}

export async function cancelCustomEmailScheduleAction(
  id: number,
): Promise<CustomEmailActionResult> {
  let session: VerifiedSession | null = null;
  try {
    session = await verifyRole(3);
    const parsed = idSchema.safeParse(id);
    if (!parsed.success) return failure("邮件 ID 无效");
    await cancelCustomEmailSchedule(session, parsed.data);
    await writeOperationAudit({
      actorId: session.uid,
      actorRole: session.realRole,
      action: "email.custom.cancel",
      resourceType: "email_custom_message",
      resourceId: parsed.data,
      department: session.department,
    });
    revalidatePath("/dashboard/emails");
    return { ok: true };
  } catch (error) {
    logServerError("email:custom:cancel", error, {
      path: "/dashboard/emails",
      userId: session?.uid ?? null,
      action: "cancel-custom-email-schedule",
      metadata: { id },
    });
    return failure(
      error instanceof Error ? error.message : "取消定时发送失败",
    );
  }
}

export async function deleteCustomEmailMessageAction(
  id: number,
): Promise<CustomEmailActionResult> {
  let session: VerifiedSession | null = null;
  try {
    session = await verifyRole(3);
    const parsed = idSchema.safeParse(id);
    if (!parsed.success) return failure("邮件 ID 无效");
    await deleteCustomEmailMessage(session, parsed.data);
    await writeOperationAudit({
      actorId: session.uid,
      actorRole: session.realRole,
      action: "email.custom.delete",
      resourceType: "email_custom_message",
      resourceId: parsed.data,
      department: session.department,
    });
    revalidatePath("/dashboard/emails");
    return { ok: true };
  } catch (error) {
    logServerError("email:custom:delete", error, {
      path: "/dashboard/emails",
      userId: session?.uid ?? null,
      action: "delete-custom-email",
      metadata: { id },
    });
    return failure(
      error instanceof Error ? error.message : "删除自定义邮件失败",
    );
  }
}

export async function retryCustomEmailAction(
  id: number,
): Promise<CustomEmailActionResult<{ queuedCount: number }>> {
  let session: VerifiedSession | null = null;
  try {
    session = await verifyRole(3);
    const parsed = idSchema.safeParse(id);
    if (!parsed.success) return failure("邮件 ID 无效");
    const result = await retryCustomMessage(session, parsed.data);
    await writeOperationAudit({
      actorId: session.uid,
      actorRole: session.realRole,
      action: "email.custom.retry",
      resourceType: "email_custom_message",
      resourceId: parsed.data,
      department: session.department,
      metadata: { queuedCount: result.queuedCount },
    });
    revalidatePath("/dashboard/emails");
    return { ok: true, data: { queuedCount: result.queuedCount } };
  } catch (error) {
    logServerError("email:custom:retry", error, {
      path: "/dashboard/emails",
      userId: session?.uid ?? null,
      action: "retry-custom-email",
      metadata: { id },
    });
    return failure(
      error instanceof Error ? error.message : "重试自定义邮件失败",
    );
  }
}
