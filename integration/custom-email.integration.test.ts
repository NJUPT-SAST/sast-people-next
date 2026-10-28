import { db } from "@/db/drizzle";
import { emailCustomMessage, emailDelivery } from "@/db/schema";
import {
  deleteCustomEmailMessage,
  refreshCustomMessageStatus,
  sendCustomMessageById,
} from "@/lib/email-center/custom-message";
import { eq } from "drizzle-orm";

const ownerSession = {
  isAuth: true as const,
  uid: 990001,
  role: 4,
  realRole: 4,
  viewAs: null,
  name: "测试管理员",
  department: "software",
};

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

    /* 还有下一次自动重试的 failed 投递仍算进行中，不能提前显示失败 */
    await db
      .update(emailDelivery)
      .set({
        status: "failed",
        nextRetryAt: new Date(Date.now() + 60_000),
        errorMessage: "temporary SMTP error",
      })
      .where(eq(emailDelivery.id, deliveries[0].id));
    await expect(refreshCustomMessageStatus(messageId)).resolves.toBe("sending");

    await db
      .update(emailDelivery)
      .set({
        status: "failed",
        nextRetryAt: null,
        errorMessage: "permanent failure",
      })
      .where(eq(emailDelivery.id, deliveries[0].id));
    await expect(refreshCustomMessageStatus(messageId)).resolves.toBe("failed");

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

  it("ignores deliveries for recipients removed from the message", async () => {
    const [row] = await db
      .insert(emailCustomMessage)
      .values({
        subject: "移除收件人状态集成测试",
        htmlBody: "<p>正文</p>",
        recipientUserIds: [],
        manualAddresses: ["kept@example.com", "removed@example.com"],
        recipientCount: 2,
        createdBy: 990001,
      })
      .returning({ id: emailCustomMessage.id });
    createdMessageIds.push(row.id);

    await sendCustomMessageById(row.id);
    const deliveries = await db
      .select()
      .from(emailDelivery)
      .where(eq(emailDelivery.fkCustomMessageId, row.id));
    const kept = deliveries.find(
      (delivery) => delivery.toAddress === "kept@example.com",
    )!;
    const removed = deliveries.find(
      (delivery) => delivery.toAddress === "removed@example.com",
    )!;

    await db
      .update(emailDelivery)
      .set({ status: "sent", sentAt: new Date() })
      .where(eq(emailDelivery.id, kept.id));
    await db
      .update(emailDelivery)
      .set({
        status: "failed",
        nextRetryAt: null,
        errorMessage: "removed recipient failure",
      })
      .where(eq(emailDelivery.id, removed.id));
    await db
      .update(emailCustomMessage)
      .set({
        status: "failed",
        manualAddresses: ["kept@example.com"],
        recipientCount: 1,
      })
      .where(eq(emailCustomMessage.id, row.id));

    await expect(refreshCustomMessageStatus(row.id)).resolves.toBe("sent");
    const [message] = await db
      .select()
      .from(emailCustomMessage)
      .where(eq(emailCustomMessage.id, row.id));
    expect(message.status).toBe("sent");
    expect(message.lastError).toBeNull();
  });

  it("rewrites queueable snapshots when an edited failed message is resent", async () => {
    const messageId = await insertCustomMessage();
    await sendCustomMessageById(messageId);

    const [delivery] = await db
      .select()
      .from(emailDelivery)
      .where(eq(emailDelivery.fkCustomMessageId, messageId));
    await db
      .update(emailDelivery)
      .set({
        status: "failed",
        subject: "旧主题",
        htmlSnapshot: "<p>旧正文</p>",
        nextRetryAt: new Date(),
        errorMessage: "old failure",
      })
      .where(eq(emailDelivery.id, delivery.id));
    await db
      .update(emailCustomMessage)
      .set({
        status: "failed",
        subject: "  edited subject  ",
        htmlBody: "<p>edited body</p>",
        updatedAt: new Date(),
      })
      .where(eq(emailCustomMessage.id, messageId));

    await sendCustomMessageById(messageId);

    const [updated] = await db
      .select()
      .from(emailDelivery)
      .where(eq(emailDelivery.id, delivery.id));
    expect(updated.status).toBe("pending");
    expect(updated.subject).toBe("edited subject");
    expect(updated.attemptCount).toBe(0);
    expect(updated.htmlSnapshot).toContain("custom email");
  });

  it("dead-letters queueable deliveries when deleting a custom message", async () => {
    const messageId = await insertCustomMessage();
    await sendCustomMessageById(messageId);

    const [delivery] = await db
      .select()
      .from(emailDelivery)
      .where(eq(emailDelivery.fkCustomMessageId, messageId));
    await db
      .update(emailDelivery)
      .set({
        status: "failed",
        nextRetryAt: new Date(Date.now() + 60_000),
        errorMessage: "retry me",
      })
      .where(eq(emailDelivery.id, delivery.id));
    await db
      .update(emailCustomMessage)
      .set({ status: "failed" })
      .where(eq(emailCustomMessage.id, messageId));

    await deleteCustomEmailMessage(ownerSession, messageId);

    const [message] = await db
      .select()
      .from(emailCustomMessage)
      .where(eq(emailCustomMessage.id, messageId));
    expect(message.status).toBe("canceled");

    const [updated] = await db
      .select()
      .from(emailDelivery)
      .where(eq(emailDelivery.id, delivery.id));
    expect(updated.status).toBe("dead");
    expect(updated.nextRetryAt).toBeNull();
    expect(updated.errorMessage).toContain("已删除");
  });
});