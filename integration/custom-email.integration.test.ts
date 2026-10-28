import { db } from "@/db/drizzle";
import { emailCustomMessage, emailDelivery } from "@/db/schema";
import {
  refreshCustomMessageStatus,
  sendCustomMessageById,
} from "@/lib/email-center/custom-message";
import { eq } from "drizzle-orm";

jest.mock("server-only", () => ({}));
jest.mock("@/event", () => ({
  __esModule: true,
  default: { offer: jest.fn().mockResolvedValue(undefined) },
}));
jest.mock("@/lib/email-center/delivery", () => ({
  sendEmailDelivery: jest.fn(),
}));
jest.mock("@react-email/render", () => ({
  render: jest.fn(async () => "<html><body>custom email</body></html>"),
}));

const createdMessageIds: number[] = [];

async function insertCustomMessage() {
  const [row] = await db
    .insert(emailCustomMessage)
    .values({
      subject: "自定义邮件集成测试",
      htmlBody: "<p>集成测试正文</p>",
      recipientUserIds: [],
      manualAddresses: ["integration-custom@example.com"],
      recipientCount: 1,
      createdBy: 990001,
    })
    .returning({ id: emailCustomMessage.id });

  createdMessageIds.push(row.id);
  return row.id;
}

describe("custom email delivery service", () => {
  afterAll(async () => {
    for (const messageId of createdMessageIds) {
      await db
        .delete(emailDelivery)
        .where(eq(emailDelivery.fkCustomMessageId, messageId));
      await db
        .delete(emailCustomMessage)
        .where(eq(emailCustomMessage.id, messageId));
    }
    await db.$client.end();
  });

  it("creates one delivery per address, marks sending, and refreshes to sent", async () => {
    const messageId = await insertCustomMessage();

    const sent = await sendCustomMessageById(messageId);
    expect(sent).toMatchObject({ status: "sending", skipped: false });
    expect(sent.queuedCount).toBe(1);

    const deliveries = await db
      .select()
      .from(emailDelivery)
      .where(eq(emailDelivery.fkCustomMessageId, messageId));
    expect(deliveries).toHaveLength(1);
    expect(deliveries[0]).toMatchObject({
      category: "custom",
      templateKey: "custom.message",
      toAddress: "integration-custom@example.com",
      status: "pending",
      fkCustomMessageId: messageId,
    });
    expect(deliveries[0].idempotencyKey).toBe(
      `custom:${messageId}:integration-custom@example.com`,
    );

    /* 同一封邮件再次入队不会为同一地址创建第二条投递 */
    const retried = await sendCustomMessageById(messageId, {
      allowStaleSending: false,
    });
    expect(retried).toMatchObject({ skipped: true, status: "sending" });

    await db
      .update(emailDelivery)
      .set({ status: "sent", sentAt: new Date() })
      .where(eq(emailDelivery.id, deliveries[0].id));

    await expect(refreshCustomMessageStatus(messageId)).resolves.toBe("sent");
    const [message] = await db
      .select()
      .from(emailCustomMessage)
      .where(eq(emailCustomMessage.id, messageId));
    expect(message.status).toBe("sent");
    expect(message.sentAt).not.toBeNull();
  });

  it("fails the message when no recipient has a usable address", async () => {
    const [row] = await db
      .insert(emailCustomMessage)
      .values({
        subject: "无收件人集成测试",
        htmlBody: "<p>正文</p>",
        recipientUserIds: [],
        manualAddresses: [],
        recipientCount: 0,
        createdBy: 990001,
      })
      .returning({ id: emailCustomMessage.id });
    createdMessageIds.push(row.id);

    const result = await sendCustomMessageById(row.id);
    expect(result).toMatchObject({ status: "failed", skipped: false });

    const deliveries = await db
      .select({ id: emailDelivery.id })
      .from(emailDelivery)
      .where(eq(emailDelivery.fkCustomMessageId, row.id));
    expect(deliveries).toHaveLength(0);
  });

  it("creates a distinct idempotency key per address", async () => {
    const [row] = await db
      .insert(emailCustomMessage)
      .values({
        subject: "多收件人幂等键集成测试",
        htmlBody: "<p>正文</p>",
        recipientUserIds: [],
        manualAddresses: ["first@example.com", "second@example.com"],
        recipientCount: 2,
        createdBy: 990001,
      })
      .returning({ id: emailCustomMessage.id });
    createdMessageIds.push(row.id);

    await sendCustomMessageById(row.id);

    const deliveries = await db
      .select({ idempotencyKey: emailDelivery.idempotencyKey })
      .from(emailDelivery)
      .where(eq(emailDelivery.fkCustomMessageId, row.id));
    expect(deliveries.map((delivery) => delivery.idempotencyKey).sort()).toEqual([
      `custom:${row.id}:first@example.com`,
      `custom:${row.id}:second@example.com`,
    ]);
  });
});