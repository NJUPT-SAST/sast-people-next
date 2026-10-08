import "server-only";

import { db } from "@/db/drizzle";
import {
  emailBatch,
  emailDelivery,
  emailDeliveryAttempt,
  flow,
  normalizeDepartmentKey,
  userFlow,
} from "@/db/schema";
import { assertEmailSendRateLimit } from "@/lib/email-center/rate-limit";
import { renderEmailTemplate } from "@/lib/email-center/render";
import { getFailedDeliveryRetryState } from "@/lib/email-center/retry-policy";
import { sendEmailViaProvider } from "@/lib/email-center/provider";
import { readResultEmailTemplateSetting } from "@/lib/email-center/template-resolution";
import { departmentLabel } from "@/const/department";
import { OFFICE_INTERVIEW_FLOW_TYPE } from "@/const/flow";
import { getResultEmailFlowKind } from "@/lib/email/result-email";
import { listPeopleUsersByLinkIds } from "@/lib/link/user-lookup";
import type {
  CreateRenderedEmailDeliveryInput,
  CreateRenderedTestEmailDeliveryInput,
  EmailCategory,
  ResultEmailTemplateKey,
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

/**
 * 渲染前解析模板归属部门：显式入参优先（null = 全局默认模板），
 * 缺省时按 user_flow.department → flow.department 逐级回退，
 * 保证队列 / 后台渲染与流程归属部门一致。
 */
async function resolveRenderDepartment(input: {
  department?: string | null;
  userFlowId?: number | null;
  flowId?: number | null;
}) {
  if (input.department !== undefined) {
    return normalizeDepartmentKey(input.department);
  }

  if (input.userFlowId) {
    const [row] = await db
      .select({ department: userFlow.department })
      .from(userFlow)
      .where(eq(userFlow.id, input.userFlowId))
      .limit(1);
    const department = normalizeDepartmentKey(row?.department);
    if (department) return department;
  }

  if (input.flowId) {
    const [row] = await db
      .select({ department: flow.department })
      .from(flow)
      .where(eq(flow.id, input.flowId))
      .limit(1);
    return normalizeDepartmentKey(row?.department);
  }

  return null;
}

export async function createRenderedEmailDelivery(
  input: CreateRenderedEmailDeliveryInput,
) {
  const department = await resolveRenderDepartment(input);
  const rendered = await renderEmailTemplate({ ...input, department });

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
  const department = await resolveRenderDepartment(input);
  const rendered = await renderEmailTemplate({ ...input, department });

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

/* 结果通知的称呼必须是真实姓名：渲染期漏替换的占位符绝不允许进入最终发送，
   旧快照（或未来的回归）在这里被拦下，并以失败原因的形式留在投递记录里可排查 */
const UNREPLACED_NAME_PLACEHOLDER = "[同学姓名]";

/* 旧版一面通知把称呼固定成占位符渲染过；只有这两个模板键的快照能按真实姓名安全重建 */
const REBUILDABLE_PLACEHOLDER_TEMPLATE_KEYS: Record<string, true> = {
  "office_round1.result.accepted": true,
  "office_round1.result.rejected": true,
};

function assertNoUnreplacedPlaceholders(content: {
  subject: string;
  htmlSnapshot: string;
}) {
  if (
    content.subject.includes(UNREPLACED_NAME_PLACEHOLDER) ||
    content.htmlSnapshot.includes(UNREPLACED_NAME_PLACEHOLDER)
  ) {
    throw new Error(
      "邮件内容里仍有未替换的「[同学姓名]」占位符，已阻止发送；请检查模板并重新创建发送任务。",
    );
  }
}

/**
 * 旧版一面通知的占位符快照恢复：这些投递在哨兵下会永久失败——队列、自动重试、
 * 手动重试拿到的都是同一份旧快照。这里按投递记录的流程与收件人重建真实姓名快照，
 * 并把重建结果写回投递行，让下一次发送用新内容；重建不了（非办公一面投递、
 * 流程/收件人缺失、收件人没有姓名、模板本身写了占位符）返回 null，仍由哨兵照常拦截。
 */
async function rebuildLegacyPlaceholderSnapshot(delivery: {
  id: number;
  templateKey: string;
  fkFlowId: number | null;
  fkUserId: number | null;
}): Promise<{ subject: string; htmlSnapshot: string } | null> {
  if (!REBUILDABLE_PLACEHOLDER_TEMPLATE_KEYS[delivery.templateKey]) {
    return null;
  }
  if (delivery.fkFlowId === null || delivery.fkUserId === null) return null;

  const [flowRow] = await db
    .select({ title: flow.title, department: flow.department })
    .from(flow)
    .where(eq(flow.id, delivery.fkFlowId))
    .limit(1);
  if (!flowRow) return null;

  const userMap = await listPeopleUsersByLinkIds([delivery.fkUserId]);
  const name = userMap.get(delivery.fkUserId)?.name?.trim();
  if (!name) return null;

  const round = 1;
  const department = normalizeDepartmentKey(flowRow.department);
  const setting = await readResultEmailTemplateSetting(
    delivery.templateKey,
    department,
  );
  const rendered = await renderEmailTemplate({
    templateKey: delivery.templateKey as ResultEmailTemplateKey,
    variables: {
      name,
      flowName: flowRow.title,
      flowKind: getResultEmailFlowKind(OFFICE_INTERVIEW_FLOW_TYPE, round),
      round,
      department: departmentLabel(flowRow.department),
      groupNumber: setting.groupNumber,
      setting,
    },
    department,
  });
  const repaired = { subject: rendered.subject, htmlSnapshot: rendered.html };
  if (
    repaired.subject.includes(UNREPLACED_NAME_PLACEHOLDER) ||
    repaired.htmlSnapshot.includes(UNREPLACED_NAME_PLACEHOLDER)
  ) {
    return null;
  }

  await db
    .update(emailDelivery)
    .set({
      subject: repaired.subject,
      htmlSnapshot: repaired.htmlSnapshot,
      updatedAt: new Date(),
    })
    .where(eq(emailDelivery.id, delivery.id));
  return repaired;
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
    /* 旧快照先尝试按真实姓名重建；重建后仍有占位符（或无法重建）才交给哨兵拦截 */
    const content =
      (delivery.subject.includes(UNREPLACED_NAME_PLACEHOLDER) ||
      delivery.htmlSnapshot.includes(UNREPLACED_NAME_PLACEHOLDER)
        ? await rebuildLegacyPlaceholderSnapshot(delivery)
        : null) ?? delivery;
    assertNoUnreplacedPlaceholders(content);
    await assertEmailSendRateLimit();
    const result = await sendEmailViaProvider({
      to: delivery.toAddress,
      subject: content.subject,
      html: content.htmlSnapshot,
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
