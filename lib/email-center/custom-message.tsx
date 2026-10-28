import "server-only";

import { render } from "@react-email/render";
import { and, asc, desc, eq, inArray, lt, lte, or } from "drizzle-orm";
import { db } from "@/db/drizzle";
import {
  emailCustomMessage,
  emailDelivery,
  normalizeDepartmentKey,
} from "@/db/schema";
import { DEFAULT_EMAIL_FRAME } from "@/lib/email/blocks";
import { EmailShell } from "@/lib/email/email-shell";
import { sanitizeEmailHtml } from "@/lib/email/sanitize";
import { EMAIL_THEME_DEFAULTS } from "@/lib/email/theme";
import type { VerifiedSession } from "@/lib/dal";
import { isAdmin } from "@/lib/authz";
import { assertEmailConfigured } from "@/lib/email-center/provider";
import { sendEmailDelivery } from "@/lib/email-center/delivery";
import { listPeopleUsersByLinkIds } from "@/lib/link/user-lookup";
import { getLinkAdminAccessTokenFromSession } from "@/lib/link/session";
import { listLinkUsers } from "@/lib/link/admin";
import type { LinkAdminUserItem } from "@/lib/link/types";
import { logServerError } from "@/lib/server-error-log";
import event from "@/event";
import type {
  CustomEmailMessageDetail,
  CustomEmailMessageRecord,
  CustomEmailRecipient,
  CustomEmailRecipientSearchResult,
  CustomEmailStatus,
  CustomEmailWorkspace,
  RenderedCustomEmail,
} from "./custom-message-types";
import {
  buildCustomEmailRecipients,
  CUSTOM_EMAIL_MAX_BODY_LENGTH,
  normalizeCustomEmailSubject,
  normalizeManualAddresses,
  normalizeRecipientUserIds,
} from "./custom-message-helpers";

export type {
  CustomEmailMessageDetail,
  CustomEmailMessageRecord,
  CustomEmailMessageSummary,
  CustomEmailRecipient,
  CustomEmailRecipientSearchResult,
  CustomEmailRecipientSearchUser,
  CustomEmailStatus,
  CustomEmailWorkspace,
  RenderedCustomEmail,
} from "./custom-message-types";

export type CustomEmailMessageRow = CustomEmailMessageRecord;

const STALE_SENDING_MINUTES = 10;
const QUEUE_CONCURRENCY = 5;

const summaryColumns = {
  id: emailCustomMessage.id,
  status: emailCustomMessage.status,
  subject: emailCustomMessage.subject,
  recipientCount: emailCustomMessage.recipientCount,
  scheduledAt: emailCustomMessage.scheduledAt,
  sentAt: emailCustomMessage.sentAt,
  updatedAt: emailCustomMessage.updatedAt,
  lastError: emailCustomMessage.lastError,
};

function runWithConcurrency<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>,
) {
  let nextIndex = 0;
  const workerCount = Math.min(concurrency, items.length);

  return Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (nextIndex < items.length) {
        const item = items[nextIndex];
        nextIndex += 1;
        await worker(item);
      }
    }),
  );
}

export function canAccessCustomEmailMessage(
  session: VerifiedSession,
  message: Pick<CustomEmailMessageRow, "createdBy" | "status">,
) {
  if (message.createdBy === session.uid) return true;
  /* 草稿与定时箱是个人空间：管理员也不能翻别人的未发送内容 */
  if (!isAdmin(session.role)) return false;
  return message.status !== "draft" && message.status !== "scheduled";
}

export async function loadCustomEmailMessage(id: number) {
  const [message] = await db
    .select()
    .from(emailCustomMessage)
    .where(eq(emailCustomMessage.id, id))
    .limit(1);
  return message ?? null;
}

export async function assertCustomEmailMessageAccess(
  session: VerifiedSession,
  id: number,
) {
  const message = await loadCustomEmailMessage(id);
  if (!message) throw new Error("自定义邮件不存在");
  if (!canAccessCustomEmailMessage(session, message)) {
    throw new Error("无权操作这封邮件");
  }
  return message;
}

export async function renderCustomEmail(input: {
  subject: string;
  bodyHtml: string;
}): Promise<RenderedCustomEmail> {
  const subject = normalizeCustomEmailSubject(input.subject);
  const bodyHtml = sanitizeEmailHtml(input.bodyHtml);

  const html = await render(
    <EmailShell
      frame={DEFAULT_EMAIL_FRAME}
      theme={EMAIL_THEME_DEFAULTS.accepted}
      title={subject}
      previewText={subject}
    >
      <div dangerouslySetInnerHTML={{ __html: bodyHtml }} />
    </EmailShell>,
  );

  return { subject, html };
}

export async function previewCustomEmail(input: {
  subject: string;
  bodyHtml: string;
}) {
  return renderCustomEmail({
    subject: input.subject,
    bodyHtml: input.bodyHtml,
  });
}

export async function resolveCustomEmailRecipients(input: {
  recipientUserIds: number[];
  manualAddresses: string[];
}) {
  const userIds = normalizeRecipientUserIds(input.recipientUserIds);
  const userMap =
    userIds.length > 0
      ? await listPeopleUsersByLinkIds(userIds)
      : new Map();
  const users = userIds.map((id) => {
    const user = userMap.get(id);
    const department = user?.departments?.[0] ?? null;
    return {
      id,
      name: user?.name ?? `用户 #${id}`,
      studentId: user?.studentId ?? null,
      email: user?.email ?? null,
      department,
      deleted: user?.isDeleted === true,
    };
  });
  const activeUsers = users.filter((user) => !user.deleted);

  return buildCustomEmailRecipients({
    users: activeUsers,
    manualAddresses: input.manualAddresses,
  });
}

export function getCustomMessageStatusText(status: CustomEmailStatus) {
  return {
    draft: "草稿",
    scheduled: "定时发送",
    sending: "发送中",
    sent: "已发送",
    failed: "有失败",
    canceled: "已取消",
  }[status];
}

export async function listCustomEmailWorkspace(
  session: VerifiedSession,
): Promise<CustomEmailWorkspace> {
  const ownDraftCondition = and(
    eq(emailCustomMessage.createdBy, session.uid),
    eq(emailCustomMessage.status, "draft"),
  );
  const ownScheduledCondition = and(
    eq(emailCustomMessage.createdBy, session.uid),
    eq(emailCustomMessage.status, "scheduled"),
  );
  const recentCondition = isAdmin(session.role)
    ? inArray(emailCustomMessage.status, [
        "sending",
        "sent",
        "failed",
        "canceled",
      ])
    : and(
        eq(emailCustomMessage.createdBy, session.uid),
        inArray(emailCustomMessage.status, [
          "sending",
          "sent",
          "failed",
          "canceled",
        ]),
      );

  const [drafts, scheduled, recent] = await Promise.all([
    db
      .select(summaryColumns)
      .from(emailCustomMessage)
      .where(ownDraftCondition)
      .orderBy(desc(emailCustomMessage.updatedAt))
      .limit(50),
    db
      .select(summaryColumns)
      .from(emailCustomMessage)
      .where(ownScheduledCondition)
      .orderBy(asc(emailCustomMessage.scheduledAt))
      .limit(50),
    db
      .select(summaryColumns)
      .from(emailCustomMessage)
      .where(recentCondition)
      .orderBy(desc(emailCustomMessage.updatedAt))
      .limit(30),
  ]);

  return { drafts, scheduled, recent };
}

export async function getCustomEmailMessageDetail(
  id: number,
  session: VerifiedSession,
): Promise<CustomEmailMessageDetail> {
  const message = await assertCustomEmailMessageAccess(session, id);
  return {
    message,
    recipients: await resolveMessageRecipientsForDisplay(message),
  };
}

async function resolveMessageRecipientsForDisplay(
  message: CustomEmailMessageRow,
): Promise<CustomEmailRecipient[]> {
  /* 展示用解析失败不能把整页打挂：回落成「用户 #id」，发送时还会重新解析 */
  try {
    const userMap =
      message.recipientUserIds.length > 0
        ? await listPeopleUsersByLinkIds(message.recipientUserIds)
        : new Map();
    const users = message.recipientUserIds.map((id) => {
      const user = userMap.get(id);
      return {
        id,
        name: user?.name ?? `用户 #${id}`,
        studentId: user?.studentId ?? null,
        email: user?.email ?? null,
        department: user?.departments?.[0] ?? null,
        deleted: user?.isDeleted === true,
      };
    });
    const activeUsers = users.filter((user) => !user.deleted);
    const built = buildCustomEmailRecipients({
      users: activeUsers,
      manualAddresses: message.manualAddresses,
    });
    const missingById = new Map(
      activeUsers.map((user) => [
        user.id,
        {
          userId: user.id,
          address: "",
          name: user.name,
          studentId: user.studentId,
          department: user.department,
        } satisfies CustomEmailRecipient,
      ]),
    );
    return [
      ...built.recipients,
      ...built.missingEmailUserIds.flatMap((id) => {
        const missing = missingById.get(id);
        return missing ? [missing] : [];
      }),
    ];
  } catch (error) {
    logServerError("email:custom:resolveRecipients", error, {
      action: "resolve-custom-email-recipients",
      metadata: { messageId: message.id },
    });
    return [
      ...message.recipientUserIds.map((id) => ({
        userId: id,
        address: "",
        name: `用户 #${id}`,
        studentId: null,
        department: null,
      })),
      ...message.manualAddresses.map((address) => ({
        userId: null,
        address,
        name: null,
        studentId: null,
        department: null,
      })),
    ];
  }
}

export async function saveCustomEmailMessage(input: {
  session: VerifiedSession;
  id?: number | null;
  subject: string;
  bodyHtml: string;
  recipientUserIds: number[];
  manualAddresses: string[];
  scheduledAt?: Date | null;
}) {
  const subject = normalizeCustomEmailSubject(input.subject);
  const bodyHtml = sanitizeEmailHtml(
    input.bodyHtml.slice(0, CUSTOM_EMAIL_MAX_BODY_LENGTH),
  );
  const recipientUserIds = normalizeRecipientUserIds(input.recipientUserIds);
  const manualAddresses = normalizeManualAddresses(input.manualAddresses);
  const scheduledAt = input.scheduledAt ?? null;
  const department = normalizeDepartmentKey(input.session.department);

  if (input.id) {
    const existing = await assertCustomEmailMessageAccess(input.session, input.id);
    if (existing.status === "sending" || existing.status === "sent" || existing.status === "canceled") {
      throw new Error("这封邮件已经发出或正在发送，不能再编辑");
    }

    const [updated] = await db
      .update(emailCustomMessage)
      .set({
        subject,
        htmlBody: bodyHtml,
        recipientUserIds,
        manualAddresses,
        recipientCount: recipientUserIds.length + manualAddresses.length,
        scheduledAt,
        status: scheduledAt ? "scheduled" : "draft",
        updatedBy: input.session.uid,
        department,
        lastError: null,
        metadata: null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(emailCustomMessage.id, input.id),
          inArray(emailCustomMessage.status, ["draft", "scheduled", "failed"]),
        ),
      )
      .returning({ id: emailCustomMessage.id });

    if (!updated) {
      throw new Error("邮件状态已变化，可能已经开始发送，请刷新后重试");
    }

    return { id: input.id };
  }

  const [created] = await db
    .insert(emailCustomMessage)
    .values({
      subject,
      htmlBody: bodyHtml,
      recipientUserIds,
      manualAddresses,
      recipientCount: recipientUserIds.length + manualAddresses.length,
      scheduledAt,
      status: scheduledAt ? "scheduled" : "draft",
      createdBy: input.session.uid,
      updatedBy: input.session.uid,
      department,
    })
    .returning({ id: emailCustomMessage.id });

  return { id: created.id };
}

export async function cancelCustomEmailSchedule(
  session: VerifiedSession,
  id: number,
) {
  const message = await assertCustomEmailMessageAccess(session, id);
  if (message.status !== "scheduled") {
    throw new Error("只有定时发送中的邮件可以取消定时");
  }

  const [updated] = await db
    .update(emailCustomMessage)
    .set({
      status: "draft",
      scheduledAt: null,
      updatedBy: session.uid,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(emailCustomMessage.id, id),
        eq(emailCustomMessage.status, "scheduled"),
      ),
    )
    .returning({ id: emailCustomMessage.id });

  if (!updated) {
    throw new Error("邮件已经开始发送，无法取消定时");
  }
}

export async function deleteCustomEmailMessage(
  session: VerifiedSession,
  id: number,
) {
  const message = await assertCustomEmailMessageAccess(session, id);
  if (message.status === "sending" || message.status === "sent") {
    throw new Error("已发送或正在发送的邮件不能删除");
  }

  const [delivery] = await db
    .select({ id: emailDelivery.id })
    .from(emailDelivery)
    .where(eq(emailDelivery.fkCustomMessageId, id))
    .limit(1);

  if (!delivery) {
    const [deleted] = await db
      .delete(emailCustomMessage)
      .where(
        and(
          eq(emailCustomMessage.id, id),
          inArray(emailCustomMessage.status, [
            "draft",
            "scheduled",
            "failed",
            "canceled",
          ]),
        ),
      )
      .returning({ id: emailCustomMessage.id });
    if (!deleted) {
      throw new Error("邮件已经开始发送，无法删除");
    }
    return;
  }

  const [updated] = await db
    .update(emailCustomMessage)
    .set({
      status: "canceled",
      scheduledAt: null,
      updatedBy: session.uid,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(emailCustomMessage.id, id),
        inArray(emailCustomMessage.status, [
          "draft",
          "scheduled",
          "failed",
          "canceled",
        ]),
      ),
    )
    .returning({ id: emailCustomMessage.id });

  if (!updated) {
    throw new Error("邮件已经开始发送，无法删除");
  }
}

export async function refreshCustomMessageStatus(id: number) {
  const [message] = await db
    .select({
      id: emailCustomMessage.id,
      status: emailCustomMessage.status,
    })
    .from(emailCustomMessage)
    .where(eq(emailCustomMessage.id, id))
    .limit(1);

  if (!message) return null;
  if (message.status === "canceled" || message.status === "draft" || message.status === "scheduled") {
    return message.status;
  }

  const deliveries = await db
    .select({
      status: emailDelivery.status,
      errorMessage: emailDelivery.errorMessage,
      sentAt: emailDelivery.sentAt,
    })
    .from(emailDelivery)
    .where(eq(emailDelivery.fkCustomMessageId, id));

  if (deliveries.length === 0) {
    if (message.status === "sending") {
      await db
        .update(emailCustomMessage)
        .set({
          status: "failed",
          lastError: "发送任务中断，没有创建任何投递，请重试。",
          updatedAt: new Date(),
        })
        .where(eq(emailCustomMessage.id, id));
      return "failed";
    }
    return message.status;
  }

  const inFlight = deliveries.filter(
    (delivery) => delivery.status === "pending" || delivery.status === "sending",
  ).length;

  if (inFlight > 0) {
    if (message.status !== "sending") {
      await db
        .update(emailCustomMessage)
        .set({ status: "sending", updatedAt: new Date() })
        .where(eq(emailCustomMessage.id, id));
    }
    return "sending";
  }

  if (deliveries.every((delivery) => delivery.status === "sent")) {
    const sentAt = deliveries.reduce<Date | null>((latest, delivery) => {
      if (!delivery.sentAt) return latest;
      return !latest || delivery.sentAt > latest ? delivery.sentAt : latest;
    }, null);
    await db
      .update(emailCustomMessage)
      .set({
        status: "sent",
        sentAt: sentAt ?? new Date(),
        lastError: null,
        updatedAt: new Date(),
      })
      .where(eq(emailCustomMessage.id, id));
    return "sent";
  }

  const firstError = deliveries.find((delivery) => delivery.errorMessage)?.errorMessage;
  await db
    .update(emailCustomMessage)
    .set({
      status: "failed",
      lastError: firstError?.slice(0, 1000) ?? "部分邮件发送失败，请在发送记录中查看。",
      updatedAt: new Date(),
    })
    .where(eq(emailCustomMessage.id, id));
  return "failed";
}

export async function sendCustomMessageById(
  id: number,
  {
    now = new Date(),
    allowStaleSending = false,
    triggeredBy = null,
  }: {
    now?: Date;
    allowStaleSending?: boolean;
    triggeredBy?: number | null;
  } = {},
) {
  const staleBefore = new Date(
    now.getTime() - STALE_SENDING_MINUTES * 60 * 1000,
  );
  const claimable = allowStaleSending
    ? or(
        inArray(emailCustomMessage.status, ["draft", "scheduled", "failed"]),
        and(
          eq(emailCustomMessage.status, "sending"),
          lt(emailCustomMessage.updatedAt, staleBefore),
        ),
      )
    : inArray(emailCustomMessage.status, ["draft", "scheduled", "failed"]);

  const [claimed] = await db
    .update(emailCustomMessage)
    .set({
      status: "sending",
      lastError: null,
      updatedAt: now,
    })
    .where(and(eq(emailCustomMessage.id, id), claimable))
    .returning();

  if (!claimed) {
    const [current] = await db
      .select({ status: emailCustomMessage.status })
      .from(emailCustomMessage)
      .where(eq(emailCustomMessage.id, id))
      .limit(1);
    return { queuedCount: 0, status: current?.status ?? null, skipped: true };
  }

  let recipients: CustomEmailRecipient[] = [];
  let missingEmailUserIds: number[] = [];
  try {
    const resolved = await resolveCustomEmailRecipients({
      recipientUserIds: claimed.recipientUserIds,
      manualAddresses: claimed.manualAddresses,
    });
    recipients = resolved.recipients;
    missingEmailUserIds = resolved.missingEmailUserIds;
  } catch (error) {
    await db
      .update(emailCustomMessage)
      .set({
        status: "failed",
        lastError:
          error instanceof Error
            ? `收件人解析失败：${error.message}`
            : "收件人解析失败",
        updatedAt: new Date(),
      })
      .where(eq(emailCustomMessage.id, id));
    throw error;
  }

  if (recipients.length === 0) {
    await db
      .update(emailCustomMessage)
      .set({
        status: "failed",
        lastError: "没有有效的收件人邮箱，请重新选择收件人。",
        recipientCount: 0,
        metadata: { missingEmailUserIds },
        updatedAt: new Date(),
      })
      .where(eq(emailCustomMessage.id, id));
    return { queuedCount: 0, status: "failed", skipped: false };
  }

  let rendered: RenderedCustomEmail;
  try {
    rendered = await renderCustomEmail({
      subject: claimed.subject,
      bodyHtml: claimed.htmlBody,
    });
  } catch (error) {
    await db
      .update(emailCustomMessage)
      .set({
        status: "failed",
        lastError:
          error instanceof Error
            ? `正文渲染失败：${error.message}`
            : "正文渲染失败",
        updatedAt: new Date(),
      })
      .where(eq(emailCustomMessage.id, id));
    throw error;
  }

  const existingDeliveries = await db
    .select({
      id: emailDelivery.id,
      status: emailDelivery.status,
      idempotencyKey: emailDelivery.idempotencyKey,
    })
    .from(emailDelivery)
    .where(eq(emailDelivery.fkCustomMessageId, id));
  const existingByKey = new Map(
    existingDeliveries
      .filter((delivery) => delivery.idempotencyKey)
      .map((delivery) => [delivery.idempotencyKey!, delivery]),
  );
  const queueableIds: number[] = [];

  for (const recipient of recipients) {
    const idempotencyKey = `custom:${id}:${recipient.address.toLowerCase()}`;
    let delivery = existingByKey.get(idempotencyKey);

    if (!delivery) {
      const [inserted] = await db
        .insert(emailDelivery)
        .values({
          idempotencyKey,
          category: "custom",
          templateKey: "custom.message",
          toAddress: recipient.address,
          subject: rendered.subject,
          htmlSnapshot: rendered.html,
          status: "pending",
          fkCustomMessageId: id,
          fkUserId: recipient.userId,
          createdBy: claimed.createdBy,
          metadata: {
            customMessageId: id,
            recipientName: recipient.name,
            recipientStudentId: recipient.studentId,
            missingEmailUserIds,
          },
        })
        .onConflictDoNothing({ target: emailDelivery.idempotencyKey })
        .returning({ id: emailDelivery.id, status: emailDelivery.status });

      if (inserted) {
        delivery = { ...inserted, idempotencyKey };
      } else {
        const [concurrent] = await db
          .select({
            id: emailDelivery.id,
            status: emailDelivery.status,
            idempotencyKey: emailDelivery.idempotencyKey,
          })
          .from(emailDelivery)
          .where(eq(emailDelivery.idempotencyKey, idempotencyKey))
          .limit(1);
        delivery = concurrent;
      }
    }

    if (!delivery) continue;
    if (
      delivery.status === "pending" ||
      delivery.status === "failed" ||
      delivery.status === "dead"
    ) {
      queueableIds.push(delivery.id);
    }
  }

  await db
    .update(emailCustomMessage)
    .set({
      recipientCount: recipients.length,
      metadata: { missingEmailUserIds },
      updatedAt: new Date(),
    })
    .where(eq(emailCustomMessage.id, id));

  if (queueableIds.length > 0) {
    /* 用户主动重发时把上一轮失败/死信的尝试次数清掉，避免刚重发就再次进入死信 */
    await db
      .update(emailDelivery)
      .set({
        status: "pending",
        attemptCount: 0,
        errorMessage: null,
        nextRetryAt: null,
        deadLetteredAt: null,
        updatedAt: new Date(),
      })
      .where(
        and(
          inArray(emailDelivery.id, queueableIds),
          inArray(emailDelivery.status, ["failed", "dead"]),
        ),
      );

    await runWithConcurrency(queueableIds, QUEUE_CONCURRENCY, async (deliveryId) => {
      try {
        await event.offer(deliveryId);
      } catch (error) {
        logServerError("email:custom:enqueue", error, {
          action: "enqueue-custom-email-delivery",
          metadata: { deliveryId, messageId: id },
        });
        try {
          assertEmailConfigured();
        } catch {
          await db
            .update(emailDelivery)
            .set({
              status: "failed",
              errorMessage:
                "邮件发送服务未启动或未配置，请检查 Inngest 邮件队列和 EMAIL_PASSWORD。",
              nextRetryAt: new Date(),
              updatedAt: new Date(),
            })
            .where(eq(emailDelivery.id, deliveryId));
          return;
        }
        try {
          await sendEmailDelivery(deliveryId, {
            trigger: "custom",
            triggeredBy,
          });
        } catch (fallbackError) {
          logServerError("email:custom:fallbackSend", fallbackError, {
            action: "custom-email-fallback-send",
            metadata: { deliveryId, messageId: id },
          });
        }
      }
    });
  }

  const status = await refreshCustomMessageStatus(id);
  return { queuedCount: queueableIds.length, status, skipped: false };
}

export async function retryCustomMessage(
  session: VerifiedSession,
  id: number,
) {
  const message = await assertCustomEmailMessageAccess(session, id);
  if (message.status !== "failed") {
    throw new Error("只有发送失败的邮件可以重试");
  }
  return sendCustomMessageById(id, {
    allowStaleSending: true,
    triggeredBy: session.uid,
  });
}

export async function dispatchDueCustomEmails({
  now = new Date(),
  limit = 20,
}: {
  now?: Date;
  limit?: number;
} = {}) {
  const due = await db
    .select({ id: emailCustomMessage.id })
    .from(emailCustomMessage)
    .where(
      and(
        eq(emailCustomMessage.status, "scheduled"),
        lte(emailCustomMessage.scheduledAt, now),
      ),
    )
    .orderBy(asc(emailCustomMessage.scheduledAt))
    .limit(limit);

  const result = { scannedCount: due.length, dispatchedCount: 0, failedCount: 0 };
  for (const message of due) {
    try {
      const sent = await sendCustomMessageById(message.id, { now });
      if (!sent.skipped) result.dispatchedCount += 1;
    } catch (error) {
      result.failedCount += 1;
      logServerError("email:custom:dispatch", error, {
        action: "dispatch-custom-email",
        metadata: { messageId: message.id },
      });
    }
  }
  return result;
}

export async function refreshSendingCustomMessages({
  now = new Date(),
  limit = 50,
} = {}) {
  const staleBefore = new Date(now.getTime() - 10 * 1000);
  const rows = await db
    .select({ id: emailCustomMessage.id })
    .from(emailCustomMessage)
    .where(
      and(
        eq(emailCustomMessage.status, "sending"),
        lt(emailCustomMessage.updatedAt, staleBefore),
      ),
    )
    .orderBy(asc(emailCustomMessage.updatedAt))
    .limit(limit);

  let refreshedCount = 0;
  for (const row of rows) {
    try {
      await refreshCustomMessageStatus(row.id);
      refreshedCount += 1;
    } catch (error) {
      logServerError("email:custom:refreshStatus", error, {
        action: "refresh-custom-email-status",
        metadata: { messageId: row.id },
      });
    }
  }
  return { scannedCount: rows.length, refreshedCount };
}

export async function searchCustomEmailRecipients(input: {
  keyword?: string;
  page?: number;
}): Promise<CustomEmailRecipientSearchResult> {
  const keyword = input.keyword?.trim().slice(0, 100) ?? "";
  const page = Number.isInteger(input.page) && input.page! > 0 ? input.page! : 1;
  const pageSize = 20;
  const accessToken = await getLinkAdminAccessTokenFromSession();
  const result = await listLinkUsers(accessToken, {
    page,
    pageSize,
    keyword: keyword || undefined,
  });

  return {
    users: result.users
      .filter((user) => user.state !== "is_deleted")
      .map((user: LinkAdminUserItem) => ({
        id: user.id,
        name: user.name,
        studentId: user.student_id ?? null,
        email: user.login_email ?? null,
        department: user.department ?? null,
        role: user.role,
      })),
    total: result.total,
    page: result.page,
    pageSize: result.page_size,
  };
}