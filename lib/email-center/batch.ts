import "server-only";

import { getEmailTemplateSetting } from "@/action/email/template";
import { syncUserRoleFromAcceptedFlows } from "@/action/user-flow/roleTransition";
import { db } from "@/db/drizzle";
import { emailBatch, emailDelivery, flow, userFlow } from "@/db/schema";
import event from "@/event";
import { getEducationEmail } from "@/lib/email/address";
import {
  getResultEmailTemplateKey,
  renderResultEmailSubject,
} from "@/lib/email/result-email";
import { assertEmailConfigured } from "@/lib/email-center/provider";
import { renderEmailTemplate } from "@/lib/email-center/render";
import { sendEmailDelivery } from "@/lib/email-center/delivery";
import { listPeopleUsersByLinkIds } from "@/lib/link/user-lookup";
import { and, eq, inArray, isNull, lt, or } from "drizzle-orm";

const EMAIL_SERVICE_UNAVAILABLE =
  "邮件发送服务未启动或未配置，请检查 Inngest 邮件队列和 EMAIL_PASSWORD。";
const STALE_SENDING_DELIVERY_MINUTES = 10;
const STALE_SENDING_DELIVERY_MESSAGE = "发送任务可能已中断，请确认后重试。";

export type CreateResultEmailBatchInput = {
  userIds: number[];
  flowId: number;
  accept: boolean;
  createdBy: number;
};

export async function createResultEmailBatch({
  userIds,
  flowId,
  accept,
  createdBy,
}: CreateResultEmailBatchInput) {
  const sourceStatus = accept ? "passed" : "failed";
  const targets = await db
    .select({
      userFlowId: userFlow.id,
      userId: userFlow.fkUserId,
      flowName: flow.title,
    })
    .from(userFlow)
    .innerJoin(flow, eq(flow.id, userFlow.fkFlowId))
    .where(
      and(
        eq(userFlow.fkFlowId, flowId),
        inArray(userFlow.fkUserId, userIds),
        eq(userFlow.progressStatus, sourceStatus),
      ),
    );

  if (targets.length === 0) {
    return { batchId: null, deliveryCount: 0 };
  }

  const userMap = await listPeopleUsersByLinkIds(
    targets.map((item) => item.userId),
  );
  const missingStudentIdRecipients = targets
    .map((item) => {
      const targetUser = userMap.get(item.userId);
      return {
        name: targetUser?.name ?? `Link 用户 #${item.userId}`,
        studentId: targetUser?.studentId ?? null,
      };
    })
    .filter((item) => !item.studentId?.trim());

  if (missingStudentIdRecipients.length > 0) {
    throw new Error(
      `以下同学缺少学号，无法生成教育邮箱：${missingStudentIdRecipients
        .map((item) => item.name)
        .join("、")}`,
    );
  }

  const templateKey = getResultEmailTemplateKey(accept);
  const templateSetting = await getEmailTemplateSetting(templateKey);
  const subject = renderResultEmailSubject(targets[0].flowName, templateSetting);

  const deliveryDrafts = await Promise.all(
    targets.map(async (item) => {
      const targetUser = userMap.get(item.userId);
      const toAddress = getEducationEmail(targetUser?.studentId);
      const rendered = await renderEmailTemplate({
        templateKey,
        variables: {
          name: targetUser?.name ?? "同学",
          flowName: item.flowName,
          setting: templateSetting,
        },
      });

      return {
        item,
        toAddress,
        rendered,
      };
    }),
  );

  return db.transaction(async (tx) => {
    const [batch] = await tx
      .insert(emailBatch)
      .values({
        templateKey,
        category: "result",
        name: `${targets[0].flowName} ${accept ? "通过" : "不通过"}通知`,
        subject,
        accept,
        status: "draft",
        totalCount: targets.length,
        fkFlowId: flowId,
        fkCreatedBy: createdBy,
        metadata: { accept },
      })
      .returning({ id: emailBatch.id });

    let deliveryCount = 0;
    for (const { item, rendered, toAddress } of deliveryDrafts) {
      await tx
        .insert(emailDelivery)
        .values({
          category: "result",
          templateKey,
          toAddress,
          subject: rendered.subject,
          htmlSnapshot: rendered.html,
          fkEmailBatchId: batch.id,
          fkFlowId: flowId,
          fkUserFlowId: item.userFlowId,
          fkUserId: item.userId,
          createdBy,
          metadata: { accept, flowId },
        })
        .returning({ id: emailDelivery.id });
      deliveryCount += 1;
    }

    return { batchId: batch.id, deliveryCount };
  });
}

export async function sendEmailBatchById(batchId: number) {
  const [batch] = await db
    .select()
    .from(emailBatch)
    .where(eq(emailBatch.id, batchId))
    .limit(1);

  if (!batch) {
    throw new Error("Email batch not found");
  }
  if (batch.category !== "result" || batch.accept === null) {
    throw new Error("Only result email batches can be sent from this action");
  }
  if (batch.status === "completed") {
    return { queuedCount: 0 };
  }

  await recoverStaleEmailDeliveriesInBatch(batchId);

  const deliveries = await db
    .select({
      id: emailDelivery.id,
      userFlowId: emailDelivery.fkUserFlowId,
      userId: emailDelivery.fkUserId,
      status: emailDelivery.status,
    })
    .from(emailDelivery)
    .where(eq(emailDelivery.fkEmailBatchId, batchId));

  const queueableDeliveries = deliveries.filter(
    (item) => item.status === "pending" || item.status === "failed",
  );

  if (queueableDeliveries.length === 0) {
    return { queuedCount: 0 };
  }

  const finalStatus = batch.accept ? "passed" : "failed";

  await db
    .update(emailDelivery)
    .set({ status: "pending", errorMessage: null, updatedAt: new Date() })
    .where(
      inArray(
        emailDelivery.id,
        queueableDeliveries.map((item) => item.id),
      ),
    );

  await db
    .update(emailBatch)
    .set({ status: "queued", updatedAt: new Date() })
    .where(eq(emailBatch.id, batchId));

  const userFlowIds = queueableDeliveries
    .map((item) => item.userFlowId)
    .filter((id): id is number => id !== null);

  if (userFlowIds.length > 0) {
    await db
      .update(userFlow)
      .set({ progressStatus: finalStatus, updatedAt: new Date() })
      .where(inArray(userFlow.id, userFlowIds));
  }

  await Promise.all(
    queueableDeliveries
      .map((item) => item.userId)
      .filter((id): id is number => id !== null)
      .map((userId) => syncUserRoleFromAcceptedFlows(userId)),
  );

  try {
    await Promise.all(
      queueableDeliveries.map(async (item) => {
        try {
          await event.offer(item.id);
        } catch (_error) {
          try {
            assertEmailConfigured();
          } catch {
            await db
              .update(emailDelivery)
              .set({
                status: "failed",
                errorMessage: EMAIL_SERVICE_UNAVAILABLE,
                updatedAt: new Date(),
              })
              .where(eq(emailDelivery.id, item.id));
            throw new Error(EMAIL_SERVICE_UNAVAILABLE);
          }

          await sendEmailDelivery(item.id);
        }
      }),
    );
  } catch (error) {
    await db
      .update(emailBatch)
      .set({ status: "failed", updatedAt: new Date() })
      .where(eq(emailBatch.id, batchId));
    throw error;
  }

  return { queuedCount: queueableDeliveries.length };
}

export async function recoverStaleEmailBatchById(batchId: number) {
  const result = await recoverStaleEmailDeliveriesInBatch(batchId);

  if (result.recoveredCount === 0) {
    return result;
  }

  await db
    .update(emailBatch)
    .set({ status: "failed", updatedAt: new Date() })
    .where(eq(emailBatch.id, batchId));

  return result;
}

async function recoverStaleEmailDeliveriesInBatch(batchId: number) {
  const cutoff = new Date(
    Date.now() - STALE_SENDING_DELIVERY_MINUTES * 60 * 1000,
  );
  const staleDeliveries = await db
    .select({ id: emailDelivery.id })
    .from(emailDelivery)
    .where(
      and(
        eq(emailDelivery.fkEmailBatchId, batchId),
        eq(emailDelivery.status, "sending"),
        or(
          lt(emailDelivery.lastAttemptAt, cutoff),
          and(
            isNull(emailDelivery.lastAttemptAt),
            lt(emailDelivery.updatedAt, cutoff),
          ),
        )!,
      ),
    );

  if (staleDeliveries.length === 0) {
    return { recoveredCount: 0 };
  }

  await db
    .update(emailDelivery)
    .set({
      status: "failed",
      errorMessage: STALE_SENDING_DELIVERY_MESSAGE,
      updatedAt: new Date(),
    })
    .where(
      inArray(
        emailDelivery.id,
        staleDeliveries.map((item) => item.id),
      ),
    );

  return { recoveredCount: staleDeliveries.length };
}
