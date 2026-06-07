import "server-only";

import { db } from "@/db/drizzle";
import { emailBatch, emailDelivery } from "@/db/schema";
import { renderEmailTemplate } from "@/lib/email-center/render";
import type {
  CreateRenderedEmailDeliveryInput,
  CreateRenderedTestEmailDeliveryInput,
  EmailCategory,
} from "@/lib/email-center/types";
import { and, eq, inArray } from "drizzle-orm";
import { createTransport } from "nodemailer";

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
  sendImmediately?: boolean;
};

const transporter = createTransport({
  host: "smtp.feishu.cn",
  port: 465,
  secure: true,
  auth: {
    user: "recruitment@sast.fun",
    pass: process.env.EMAIL_PASSWORD,
  },
});

const emailFrom = '"SAST People" <recruitment@sast.fun>';
const DEFAULT_TEST_EMAIL_RECIPIENT = "b24150524@njupt.edu.cn";

function getTestEmailRecipient() {
  const value = process.env.EMAIL_TEST_RECIPIENT?.trim();
  return value || DEFAULT_TEST_EMAIL_RECIPIENT;
}

function resolveEmailEnvelope(to: string, subject: string) {
  if (process.env.NODE_ENV === "production") {
    return { to, subject };
  }

  const testRecipient = getTestEmailRecipient();
  return {
    to: testRecipient,
    subject: `[TEST to ${to}] ${subject}`,
  };
}

export const assertEmailConfigured = () => {
  if (!process.env.EMAIL_PASSWORD) {
    throw new Error("邮件密码未配置，请先设置 EMAIL_PASSWORD。");
  }
};

const sendSmtpEmail = async ({
  to,
  subject,
  html,
}: {
  to: string;
  subject: string;
  html: string;
}) => {
  assertEmailConfigured();
  const envelope = resolveEmailEnvelope(to, subject);
  return transporter.sendMail({
    from: emailFrom,
    to: envelope.to,
    subject: envelope.subject,
    html,
  });
};

export async function createEmailDelivery(input: CreateEmailDeliveryInput) {
  const [delivery] = await db
    .insert(emailDelivery)
    .values({
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
    const result = await sendEmailDelivery(delivery.id);
    messageId = result.messageId;
  }

  return { deliveryId: delivery.id, messageId };
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
    sendImmediately: input.sendImmediately,
  });
}

export const sendEmailDelivery = async (deliveryId: number) => {
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

  const [claimedDelivery] = await db
    .update(emailDelivery)
    .set({
      status: "sending",
      errorMessage: null,
      providerMessageId: null,
      sentAt: null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(emailDelivery.id, deliveryId),
        inArray(emailDelivery.status, ["pending", "failed"]),
      ),
    )
    .returning({
      id: emailDelivery.id,
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
    const result = await sendSmtpEmail({
      to: delivery.toAddress,
      subject: delivery.subject,
      html: delivery.htmlSnapshot,
    });
    await db
      .update(emailDelivery)
      .set({
        status: "sent",
        providerMessageId: result.messageId ?? null,
        sentAt: new Date(),
        errorMessage: null,
        updatedAt: new Date(),
      })
      .where(eq(emailDelivery.id, deliveryId));
    await refreshBatchStatus(delivery.fkEmailBatchId);
    return { messageId: result.messageId ?? null };
  } catch (error) {
    await db
      .update(emailDelivery)
      .set({
        status: "failed",
        errorMessage: error instanceof Error ? error.message : String(error),
        updatedAt: new Date(),
      })
      .where(eq(emailDelivery.id, deliveryId));
    await refreshBatchStatus(delivery.fkEmailBatchId);
    throw error;
  }
};

async function refreshBatchStatus(batchId: number | null) {
  if (!batchId) return;

  const deliveries = await db
    .select({ status: emailDelivery.status })
    .from(emailDelivery)
    .where(eq(emailDelivery.fkEmailBatchId, batchId));

  if (deliveries.length === 0) return;

  const hasFailed = deliveries.some((item) => item.status === "failed");
  const allSent = deliveries.every((item) => item.status === "sent");

  await db
    .update(emailBatch)
    .set({
      status: hasFailed ? "failed" : allSent ? "completed" : "queued",
      updatedAt: new Date(),
    })
    .where(eq(emailBatch.id, batchId));
}
