import "server-only";

import { db } from "@/db/drizzle";
import { emailBatch, emailDelivery, emailDeliveryAttempt } from "@/db/schema";
import { assertEmailSendRateLimit } from "@/lib/email-center/rate-limit";
import { renderEmailTemplate } from "@/lib/email-center/render";
import { getFailedDeliveryRetryState } from "@/lib/email-center/retry-policy";
import { sendEmailViaProvider } from "@/lib/email-center/provider";
import type {
  CreateRenderedEmailDeliveryInput,
  CreateRenderedTestEmailDeliveryInput,
  EmailCategory,
} from "@/lib/email-center/types";
import { and, eq, inArray, sql } from "drizzle-orm";

export type SendEmailDeliveryTrigger =
  | "queue"
  | "manual_retry"
  | "batch_fallback"
  | "auto_retry"
  | "test"
  | "interview_immediate"
  | "immediate"
  | "unknown";

export type SendEmailDeliveryOptions = {
  trigger?: SendEmailDeliveryTrigger;
  triggeredBy?: number | null;
};

export type CreateEmailDeliveryInput = {
  category: EmailCategory;
  templateKey: string;
  toAddress: string;
  subject: string;
  htmlSnapshot: string;
  recipientUserId?: number | null;
  flowId?: number | null;
  batchId?: number | null;
  userFlowId?: number | null;
  relatedScheduleId?: number | null;
  createdBy?: number | null;
  metadata?: Record<string, unknown>;
  idempotencyKey?: string | null;
  sendImmediately?: boolean;
};

export async function createEmailDelivery(input: CreateEmailDeliveryInput) {
  const [delivery] = await db
    .insert(emailDelivery)
    .values({
      idempotencyKey: input.idempotencyKey ?? null,
      category: input.category,
      templateKey: input.templateKey,
      toAddress: input.toAddress,
      subject: input.subject,
      htmlSnapshot: input.htmlSnapshot,
      fkEmailBatchId: input.batchId ?? null,
      fkFlowId: input.flowId ?? null,
      fkUserFlowId: input.userFlowId ?? null,
      fkUserId: input.recipientUserId ?? null,
      relatedScheduleId: input.relatedScheduleId ?? null,
      createdBy: input.createdBy ?? null,
      metadata: input.metadata,
    })
    .returning({ id: emailDelivery.id });

  let messageId: string | null = null;
  if (input.sendImmediately) {
    const result = await sendEmailDelivery(delivery.id, {
      trigger: getImmediateDeliveryTrigger(input.category),
      triggeredBy: input.createdBy ?? null,
    });
    messageId = result.messageId;
  }

  return { deliveryId: delivery.id, messageId };
}

function getImmediateDeliveryTrigger(
  category: EmailCategory,
): SendEmailDeliveryTrigger {
  if (category === "test") return "test";
  if (category === "interview") return "interview_immediate";
  return "immediate";
}

function getAttemptDurationMs(startedAt: Date, finishedAt: Date) {
  return Math.max(0, finishedAt.getTime() - startedAt.getTime());
}

export async function createRenderedEmailDelivery(
  input: CreateRenderedEmailDeliveryInput,
) {
  const rendered = await renderEmailTemplate(input);

  const category = input.templateKey.startsWith("interview.")
    ? "interview"
    : "result";

  return createEmailDelivery({
    category,
    templateKey: input.templateKey,
    toAddress: input.toAddress,
    subject: rendered.subject,
    htmlSnapshot: rendered.html,
    recipientUserId: input.recipientUserId,
    flowId: input.flowId,
    batchId: input.batchId,
    userFlowId: input.userFlowId,
    relatedScheduleId: input.relatedScheduleId,
    createdBy: input.createdBy,
    metadata: input.metadata,
    idempotencyKey: input.idempotencyKey,
    sendImmediately: input.sendImmediately,
  });
}

export async function createRenderedTestEmailDelivery(
  input: CreateRenderedTestEmailDeliveryInput,
) {
  const rendered = await renderEmailTemplate(input);

  return createEmailDelivery({
    category: "test",
    templateKey: `${input.templateKey}.test`,
    toAddress: input.toAddress,
    subject: rendered.subject,
    htmlSnapshot: rendered.html,
    recipientUserId: input.recipientUserId,
    flowId: input.flowId,
    createdBy: input.createdBy,
    metadata: {
      ...input.metadata,
      originalTemplateKey: input.templateKey,
    },
    idempotencyKey: input.idempotencyKey,
    sendImmediately: input.sendImmediately,
  });
}

export const sendEmailDelivery = async (
  deliveryId: number,
  options: SendEmailDeliveryOptions = {},
) => {
  const [delivery] = await db
    .select()
    .from(emailDelivery)
    .where(eq(emailDelivery.id, deliveryId))
    .limit(1);

  if (!delivery) {
    throw new Error(`Email delivery ${deliveryId} not found`);
  }

  if (delivery.status === "sent") {
    return { messageId: delivery.providerMessageId ?? null };
  }
  if (delivery.status === "sending") {
    throw new Error("邮件正在发送中，请稍后刷新状态或恢复中断任务。");
  }
  if (delivery.status === "dead" && options.trigger !== "manual_retry") {
    throw new Error("邮件已进入死信状态，请在确认原因后手动重试。");
  }

  const attemptAt = new Date();
  const claimableStatuses =
    options.trigger === "manual_retry"
      ? (["pending", "failed", "dead"] as const)
      : (["pending", "failed"] as const);
  const claimedDelivery = await db.transaction(async (tx) => {
    const [claimed] = await tx
      .update(emailDelivery)
      .set({
        status: "sending",
        errorMessage: null,
        providerMessageId: null,
        sentAt: null,
        nextRetryAt: null,
        deadLetteredAt: null,
        attemptCount: sql`${emailDelivery.attemptCount} + 1`,
        lastAttemptAt: attemptAt,
        updatedAt: attemptAt,
      })
      .where(
        and(
          eq(emailDelivery.id, deliveryId),
          inArray(emailDelivery.status, claimableStatuses),
        ),
      )
      .returning({
        id: emailDelivery.id,
      });

    if (!claimed) return null;

    const [attempt] = await tx
      .insert(emailDeliveryAttempt)
      .values({
        fkEmailDeliveryId: deliveryId,
        trigger: options.trigger ?? "unknown",
        provider: "smtp",
        status: "sending",
        triggeredBy: options.triggeredBy ?? null,
        startedAt: attemptAt,
      })
      .returning({ id: emailDeliveryAttempt.id });

    return { deliveryId: claimed.id, attemptId: attempt.id };
  });

  if (!claimedDelivery) {
    const [latestDelivery] = await db
      .select({
        status: emailDelivery.status,
        providerMessageId: emailDelivery.providerMessageId,
      })
      .from(emailDelivery)
      .where(eq(emailDelivery.id, deliveryId))
      .limit(1);

    if (latestDelivery?.status === "sent") {
      return { messageId: latestDelivery.providerMessageId ?? null };
    }
    throw new Error("邮件正在发送中，请稍后刷新状态或恢复中断任务。");
  }

  try {
    await assertEmailSendRateLimit();
    const result = await sendEmailViaProvider({
      to: delivery.toAddress,
      subject: delivery.subject,
      html: delivery.htmlSnapshot,
    });
    const finishedAt = new Date();
    await db.transaction(async (tx) => {
      await tx
        .update(emailDelivery)
        .set({
          status: "sent",
          providerMessageId: result.messageId ?? null,
          sentAt: finishedAt,
          errorMessage: null,
          nextRetryAt: null,
          deadLetteredAt: null,
          updatedAt: finishedAt,
        })
        .where(eq(emailDelivery.id, deliveryId));
      await tx
        .update(emailDeliveryAttempt)
        .set({
          status: "sent",
          providerMessageId: result.messageId ?? null,
          errorMessage: null,
          finishedAt,
          durationMs: getAttemptDurationMs(attemptAt, finishedAt),
        })
        .where(eq(emailDeliveryAttempt.id, claimedDelivery.attemptId));
    });
    await refreshEmailBatchStatus(delivery.fkEmailBatchId);
    return { messageId: result.messageId ?? null };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const finishedAt = new Date();
    const retryState = getFailedDeliveryRetryState({
      attemptCount: delivery.attemptCount + 1,
      now: finishedAt,
    });
    await db.transaction(async (tx) => {
      await tx
        .update(emailDelivery)
        .set({
          status: retryState.status,
          errorMessage,
          nextRetryAt: retryState.nextRetryAt,
          deadLetteredAt: retryState.deadLetteredAt,
          updatedAt: finishedAt,
        })
        .where(eq(emailDelivery.id, deliveryId));
      await tx
        .update(emailDeliveryAttempt)
        .set({
          status: "failed",
          errorMessage,
          finishedAt,
          durationMs: getAttemptDurationMs(attemptAt, finishedAt),
        })
        .where(eq(emailDeliveryAttempt.id, claimedDelivery.attemptId));
    });
    await refreshEmailBatchStatus(delivery.fkEmailBatchId);
    throw error;
  }
};

export async function refreshEmailBatchStatus(batchId: number | null) {
  if (!batchId) return;

  const deliveries = await db
    .select({ status: emailDelivery.status })
    .from(emailDelivery)
    .where(eq(emailDelivery.fkEmailBatchId, batchId));

  if (deliveries.length === 0) return;

  const hasFailed = deliveries.some(
    (item) => item.status === "failed" || item.status === "dead",
  );
  const allSent = deliveries.every((item) => item.status === "sent");

  await db
    .update(emailBatch)
    .set({
      status: hasFailed ? "failed" : allSent ? "completed" : "queued",
      updatedAt: new Date(),
    })
    .where(eq(emailBatch.id, batchId));
}
