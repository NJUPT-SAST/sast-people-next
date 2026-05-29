import 'server-only';
import { createTransport } from 'nodemailer';
import { mqClient } from './client';
import { db } from '@/db/drizzle';
import { emailBatch, emailDelivery } from '@/db/schema';
import { eq } from 'drizzle-orm';

const transporter = createTransport({
  host: 'smtp.feishu.cn',
  port: 465,
  secure: true,
  auth: {
    user: 'recruitment@sast.fun',
    pass: process.env.EMAIL_PASSWORD,
  },
});

const emailFrom = '"SAST R&D Center" <recruitment@sast.fun>';

export const assertEmailConfigured = () => {
  if (!process.env.EMAIL_PASSWORD) {
    throw new Error("邮件密码未配置，请先设置 EMAIL_PASSWORD。");
  }
};

export const sendRawEmail = async ({
  to,
  subject,
  html,
}: {
  to: string;
  subject: string;
  html: string;
}) => {
  assertEmailConfigured();
  return transporter.sendMail({
    from: emailFrom,
    to,
    subject,
    html,
  });
};

export const sendEmail = mqClient.createFunction(
  { 
    id: 'step/send.email',
    triggers: [{ event: 'step/send.email' }]
  },
  async ({ event, step: _step }) => {
    const { deliveryId } = event.data;
    await sendDelivery(Number(deliveryId));
    return { success: true, deliveryId };
  },
);

export const sendDelivery = async (deliveryId: number) => {
  const [delivery] = await db
    .select()
    .from(emailDelivery)
    .where(eq(emailDelivery.id, deliveryId))
    .limit(1);

  if (!delivery) {
    throw new Error(`Email delivery ${deliveryId} not found`);
  }

  if (delivery.status === 'sent') {
    return;
  }

  await db
    .update(emailDelivery)
    .set({ status: 'sending', errorMessage: null })
    .where(eq(emailDelivery.id, deliveryId));

  try {
    const result = await sendRawEmail({
      to: delivery.toAddress,
      subject: delivery.subject,
      html: delivery.htmlSnapshot,
    });
    await db
      .update(emailDelivery)
      .set({
        status: 'sent',
        providerMessageId: result.messageId ?? null,
        sentAt: new Date(),
        errorMessage: null,
      })
      .where(eq(emailDelivery.id, deliveryId));
    await refreshBatchStatus(delivery.fkEmailBatchId);
  } catch (error) {
    await db
      .update(emailDelivery)
      .set({
        status: 'failed',
        errorMessage: error instanceof Error ? error.message : String(error),
      })
      .where(eq(emailDelivery.id, deliveryId));
    await refreshBatchStatus(delivery.fkEmailBatchId);
    throw error;
  }
};

async function refreshBatchStatus(batchId: number) {
  const deliveries = await db
    .select({ status: emailDelivery.status })
    .from(emailDelivery)
    .where(eq(emailDelivery.fkEmailBatchId, batchId));

  if (deliveries.length === 0) return;

  const hasFailed = deliveries.some((item) => item.status === 'failed');
  const allSent = deliveries.every((item) => item.status === 'sent');

  await db
    .update(emailBatch)
    .set({ status: hasFailed ? 'failed' : allSent ? 'completed' : 'queued' })
    .where(eq(emailBatch.id, batchId));
}
