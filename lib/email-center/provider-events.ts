import "server-only";

import { timingSafeEqual } from "crypto";

import { db } from "@/db/drizzle";
import { emailDelivery, emailDeliveryAttempt } from "@/db/schema";
import { getFailedDeliveryRetryState } from "@/lib/email-center/retry-policy";
import { refreshEmailBatchStatus } from "@/lib/email-center/delivery";
import { eq, type SQL } from "drizzle-orm";

const providerEventKinds = [
  "sent",
  "delivered",
  "deferred",
  "bounced",
  "complained",
  "dropped",
  "failed",
] as const;

export type EmailProviderEventKind = (typeof providerEventKinds)[number];

export type EmailProviderEvent = {
  provider: string;
  event: EmailProviderEventKind;
  deliveryId: number | null;
  messageId: string | null;
  errorMessage: string | null;
  occurredAt: Date;
};

type RawPayload = Record<string, unknown>;

function getStringValue(payload: RawPayload, keys: string[]) {
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return null;
}

function getPositiveIntegerValue(payload: RawPayload, keys: string[]) {
  for (const key of keys) {
    const value = payload[key];
    const parsed = typeof value === "number" ? value : Number(value);
    if (Number.isInteger(parsed) && parsed > 0) return parsed;
  }
  return null;
}

function parseOccurredAt(value: string | null) {
  if (!value) return new Date();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function isProviderEventKind(value: string): value is EmailProviderEventKind {
  return providerEventKinds.includes(value as EmailProviderEventKind);
}

export function parseEmailProviderEventPayload(payload: unknown): EmailProviderEvent {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    throw new Error("Invalid email provider event payload");
  }

  const raw = payload as RawPayload;
  const eventValue = getStringValue(raw, ["event", "type", "eventType"]);
  if (!eventValue || !isProviderEventKind(eventValue)) {
    throw new Error("Unsupported email provider event type");
  }

  const deliveryId = getPositiveIntegerValue(raw, ["deliveryId", "delivery_id"]);
  const messageId = getStringValue(raw, [
    "messageId",
    "message_id",
    "providerMessageId",
    "provider_message_id",
  ]);

  if (!deliveryId && !messageId) {
    throw new Error("Email provider event requires deliveryId or messageId");
  }

  return {
    provider: getStringValue(raw, ["provider"]) ?? "unknown",
    event: eventValue,
    deliveryId,
    messageId,
    errorMessage: getStringValue(raw, [
      "errorMessage",
      "error_message",
      "reason",
      "description",
    ]),
    occurredAt: parseOccurredAt(
      getStringValue(raw, ["occurredAt", "occurred_at", "timestamp"]),
    ),
  };
}

export function verifyEmailWebhookSecret({
  expectedSecret,
  providedSecret,
}: {
  expectedSecret: string | null;
  providedSecret: string | null;
}) {
  if (!expectedSecret || !providedSecret) return false;

  const expected = Buffer.from(expectedSecret);
  const provided = Buffer.from(providedSecret);
  return expected.length === provided.length && timingSafeEqual(expected, provided);
}

function getProviderEventErrorMessage(event: EmailProviderEvent) {
  return event.errorMessage ?? `Provider event: ${event.event}`;
}

function getProviderEventDeliveryUpdate({
  event,
  attemptCount,
}: {
  event: EmailProviderEvent;
  attemptCount: number;
}) {
  if (event.event === "sent" || event.event === "delivered") {
    return {
      status: "sent" as const,
      providerMessageId: event.messageId,
      sentAt: event.occurredAt,
      errorMessage: null,
      nextRetryAt: null,
      deadLetteredAt: null,
      updatedAt: event.occurredAt,
    };
  }

  if (event.event === "deferred") {
    const retryState = getFailedDeliveryRetryState({
      attemptCount: Math.max(1, attemptCount),
      now: event.occurredAt,
    });

    return {
      status: retryState.status,
      providerMessageId: event.messageId,
      sentAt: null,
      errorMessage: getProviderEventErrorMessage(event),
      nextRetryAt: retryState.nextRetryAt,
      deadLetteredAt: retryState.deadLetteredAt,
      updatedAt: event.occurredAt,
    };
  }

  return {
    status: "dead" as const,
    providerMessageId: event.messageId,
    sentAt: null,
    errorMessage: getProviderEventErrorMessage(event),
    nextRetryAt: null,
    deadLetteredAt: event.occurredAt,
    updatedAt: event.occurredAt,
  };
}

export async function applyEmailProviderEvent(event: EmailProviderEvent) {
  let deliveryWhere: SQL<unknown>;
  if (event.deliveryId) {
    deliveryWhere = eq(emailDelivery.id, event.deliveryId);
  } else {
    const messageId = event.messageId;
    if (!messageId) {
      throw new Error("Email provider event requires deliveryId or messageId");
    }
    deliveryWhere = eq(emailDelivery.providerMessageId, messageId);
  }

  const [delivery] = await db
    .select({
      id: emailDelivery.id,
      batchId: emailDelivery.fkEmailBatchId,
      providerMessageId: emailDelivery.providerMessageId,
      attemptCount: emailDelivery.attemptCount,
    })
    .from(emailDelivery)
    .where(deliveryWhere)
    .limit(1);

  if (!delivery) {
    return { matched: false, deliveryId: null, status: null };
  }

  const update = getProviderEventDeliveryUpdate({
    event: {
      ...event,
      messageId: event.messageId ?? delivery.providerMessageId,
    },
    attemptCount: delivery.attemptCount,
  });

  await db.transaction(async (tx) => {
    await tx
      .update(emailDelivery)
      .set(update)
      .where(eq(emailDelivery.id, delivery.id));
    await tx.insert(emailDeliveryAttempt).values({
      fkEmailDeliveryId: delivery.id,
      trigger: "provider_event",
      provider: event.provider,
      status: event.event,
      providerMessageId: update.providerMessageId,
      errorMessage: update.errorMessage,
      startedAt: event.occurredAt,
      finishedAt: event.occurredAt,
      durationMs: 0,
    });
  });

  await refreshEmailBatchStatus(delivery.batchId);

  return {
    matched: true,
    deliveryId: delivery.id,
    status: update.status,
  };
}
