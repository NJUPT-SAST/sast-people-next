import "server-only";

import { readResultEmailTemplateSetting } from "@/lib/email-center/template-resolution";
import { db } from "@/db/drizzle";
import { emailBatch, emailDelivery, flow, normalizeDepartmentKey, userFlow } from "@/db/schema";
import { departmentLabel } from "@/const/department";
import { isOfficeInterviewFlow, OFFICE_INTERVIEW_FLOW_TYPE } from "@/const/flow";
import event from "@/event";
import { getEducationEmail } from "@/lib/email/address";
import {
  getResultEmailTemplateKey,
  getResultEmailFlowKind,
  renderResultEmailSubject,
} from "@/lib/email/result-email";
import {
  getResultEmailBatchIdempotencyKey,
  getResultEmailDeliveryIdempotencyKey,
} from "@/lib/email-center/idempotency";
import { assertEmailConfigured } from "@/lib/email-center/provider";
import { renderEmailTemplate } from "@/lib/email-center/render";
import type { ResultEmailTemplateSetting } from "@/lib/email/template-settings";
import { sendEmailDelivery } from "@/lib/email-center/delivery";
import { listPeopleUsersByLinkIds } from "@/lib/link/user-lookup";
import { and, eq, inArray, isNull, lt, or, sql } from "drizzle-orm";

const EMAIL_SERVICE_UNAVAILABLE =
  "邮件发送服务未启动或未配置，请检查 Inngest 邮件队列和 EMAIL_PASSWORD。";
const STALE_SENDING_DELIVERY_MINUTES = 10;
const STALE_SENDING_DELIVERY_MESSAGE = "发送任务可能已中断，请确认后重试。";
const BATCH_SEND_CONCURRENCY = 5;

export type CreateResultEmailBatchInput = {
  userIds: number[];
  userFlowIds?: number[];
  flowId: number;
  accept: boolean;
  createdBy: number;
  flowType?: string;
  /** 办公类部门面试轮次：1 = 一轮，2 = 二轮；缺省时办公类流程按二轮（最终结果）处理 */
  flowRound?: number | null;
  /** 模板归属部门；缺省时按流程归属部门解析 */
  department?: string | null;
  templateSetting?: ResultEmailTemplateSetting;
};

async function runWithConcurrency<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>,
) {
  let nextIndex = 0;
  const workerCount = Math.min(concurrency, items.length);

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (nextIndex < items.length) {
        const item = items[nextIndex];
        nextIndex += 1;
        await worker(item);
      }
    }),
  );
}

export async function createResultEmailBatch({
  userIds,
  userFlowIds,
  flowId,
  accept,
  createdBy,
  flowType = "recruitment",
  flowRound: requestedFlowRound,
  department: requestedDepartment,
  templateSetting: confirmedTemplateSetting,
}: CreateResultEmailBatchInput) {
  const sourceStatus = accept ? "passed" : "failed";
  if (userFlowIds?.length === 0) {
    return { batchId: null, deliveryCount: 0 };
  }
  const targets = await db
    .select({
      userFlowId: userFlow.id,
      userId: userFlow.fkUserId,
      flowName: flow.title,
      flowDepartment: flow.department,
    })
    .from(userFlow)
    .innerJoin(flow, eq(flow.id, userFlow.fkFlowId))
    .where(
      and(
        eq(userFlow.fkFlowId, flowId),
        inArray(userFlow.fkUserId, userIds),
        userFlowIds ? inArray(userFlow.id, userFlowIds) : undefined,
        eq(userFlow.progressStatus, sourceStatus),
        /* 办公类流程的最终（二面）结果只发给进入二面阶段的候选人：
           一面未通过者已在「一面结果通知」中单独通知，避免重复收到不通过邮件 */
        isOfficeInterviewFlow(flowType) ? eq(userFlow.round, 2) : undefined,
      ),
    );

  if (targets.length === 0) {
    return { batchId: null, deliveryCount: 0 };
  }

  const targetsWithIdempotency = targets.map((item) => ({
    ...item,
    idempotencyKey: getResultEmailDeliveryIdempotencyKey({
      flowId,
      accept,
      userFlowId: item.userFlowId,
    }),
  }));

  const resultFlowId = sql<number>`coalesce(${emailDelivery.fkFlowId}, ${emailBatch.fkFlowId})`;
  const resultAccept = sql<boolean>`case coalesce(${emailDelivery.metadata}->>'accept', ${emailBatch.accept}::text) when 'true' then true when 'false' then false else null end`;

  const currentDeliveries = await db
    .select({
      idempotencyKey: emailDelivery.idempotencyKey,
      batchId: emailDelivery.fkEmailBatchId,
      userFlowId: emailDelivery.fkUserFlowId,
      userId: emailDelivery.fkUserId,
      status: emailDelivery.status,
    })
    .from(emailDelivery)
    .where(
      inArray(
        emailDelivery.idempotencyKey,
        targetsWithIdempotency.map((item) => item.idempotencyKey),
      ),
    );
  const legacyDeliveries = await db
    .select({
      idempotencyKey: emailDelivery.idempotencyKey,
      batchId: emailDelivery.fkEmailBatchId,
      userFlowId: emailDelivery.fkUserFlowId,
      userId: emailDelivery.fkUserId,
      status: emailDelivery.status,
    })
    .from(emailDelivery)
    .leftJoin(emailBatch, eq(emailBatch.id, emailDelivery.fkEmailBatchId))
    .where(
      and(
        isNull(emailDelivery.idempotencyKey),
        eq(emailDelivery.category, "result"),
        eq(resultFlowId, flowId),
        eq(resultAccept, accept),
        or(
          inArray(
            emailDelivery.fkUserFlowId,
            targetsWithIdempotency.map((item) => item.userFlowId),
          ),
          inArray(
            emailDelivery.fkUserId,
            targetsWithIdempotency.map((item) => item.userId),
          ),
        ),
      ),
    );
  const existingDeliveries = [...currentDeliveries, ...legacyDeliveries];
  const existingIdempotencyKeys = new Set(
    existingDeliveries
      .map((item) => item.idempotencyKey)
      .filter((key): key is string => key !== null),
  );
  const existingUserFlowIds = new Set(
    existingDeliveries
      .map((item) => item.userFlowId)
      .filter((id): id is number => id !== null),
  );
  const existingUserIds = new Set(
    existingDeliveries
      .map((item) => item.userId)
      .filter((id): id is number => id !== null),
  );
  const missingTargets = targetsWithIdempotency.filter(
    (item) =>
      !existingIdempotencyKeys.has(item.idempotencyKey) &&
      !existingUserFlowIds.has(item.userFlowId) &&
      !existingUserIds.has(item.userId),
  );

  if (missingTargets.length === 0) {
    const targetUserFlowIds = new Set(
      targetsWithIdempotency.map((item) => item.userFlowId),
    );
    const candidateBatchIds = Array.from(
      new Set(
        existingDeliveries
          .map((item) => item.batchId)
          .filter((id): id is number => id !== null),
      ),
    );
    const candidateDeliveries = candidateBatchIds.length === 0
      ? []
      : await db
          .select({ batchId: emailDelivery.fkEmailBatchId, userFlowId: emailDelivery.fkUserFlowId })
          .from(emailDelivery)
          .where(inArray(emailDelivery.fkEmailBatchId, candidateBatchIds));
    const deliveriesByBatch = new Map<number, number[]>();
    for (const delivery of candidateDeliveries) {
      if (delivery.batchId === null || delivery.userFlowId === null) continue;
      const rows = deliveriesByBatch.get(delivery.batchId) ?? [];
      rows.push(delivery.userFlowId);
      deliveriesByBatch.set(delivery.batchId, rows);
    }
    const reusableBatchId = existingDeliveries.find((item) => {
      if (
        item.batchId === null ||
        !["pending", "failed", "dead"].includes(item.status)
      ) return false;
      const batchUserFlowIds = deliveriesByBatch.get(item.batchId);
      if (!batchUserFlowIds || batchUserFlowIds.length !== targetUserFlowIds.size) return false;
      return batchUserFlowIds.every((userFlowId) => targetUserFlowIds.has(userFlowId));
    })?.batchId;
    const legacyReusableBatchId = reusableBatchId ?? (
      candidateDeliveries.length === 0 &&
      existingDeliveries.length > 0 &&
      existingDeliveries.every(
        (item) =>
          item.batchId !== null &&
          item.userFlowId === null &&
          item.userId !== null &&
          targetsWithIdempotency.some((target) => target.userId === item.userId),
      )
        ? existingDeliveries[0]?.batchId ?? null
        : null
    );

    return {
      batchId: legacyReusableBatchId,
      deliveryCount: 0,
    };
  }

  const userMap = await listPeopleUsersByLinkIds(
    missingTargets.map((item) => item.userId),
  );
  /* 收件人资料一次整理：姓名与学号都必须是真实值，缺任何一项都不发 */
  const recipients = missingTargets.map((item) => {
    const targetUser = userMap.get(item.userId);
    return {
      ...item,
      name: targetUser?.name?.trim() ?? "",
      studentId: targetUser?.studentId ?? null,
    };
  });
  const missingStudentIdRecipients = recipients.filter(
    (item) => !item.studentId?.trim(),
  );

  if (missingStudentIdRecipients.length > 0) {
    throw new Error(
      `以下同学缺少学号，无法生成教育邮箱：${missingStudentIdRecipients
        .map((item) => item.name || `Link 用户 #${item.userId}`)
        .join("、")}`,
    );
  }

  /* 称呼按真实姓名渲染：Link 没有姓名的候选人先拦住，绝不能把占位称呼发出去 */
  const missingNameRecipients = recipients.filter((item) => !item.name);
  if (missingNameRecipients.length > 0) {
    throw new Error(
      `以下同学缺少姓名，无法发送实名通知：${missingNameRecipients
        .map((item) => `Link 用户 #${item.userId}`)
        .join("、")}`,
    );
  }

  /* 办公类部门面试招新是所有办公部门共用的一条流程，邮件只用于发布二轮（最终）结果 */
  const flowRound = requestedFlowRound ?? (isOfficeInterviewFlow(flowType) ? 2 : null);
  const flowKind = getResultEmailFlowKind(flowType, flowRound);
  const templateKey = getResultEmailTemplateKey(flowType, accept, flowRound);
  /* 模板归属：显式入参优先，否则回落流程归属部门；未归属部门的流程用全局默认模板。
     办公类流程同样是 flow.department = 该办公部门，因此与其它部门走同一条解析路径。 */
  const department =
    requestedDepartment !== undefined
      ? normalizeDepartmentKey(requestedDepartment)
      : normalizeDepartmentKey(targets[0].flowDepartment);
  const templateSetting =
    confirmedTemplateSetting ??
    (await readResultEmailTemplateSetting(templateKey, department));
  /* {department} 用流程归属部门的展示名渲染：候选人邮件里出现的是「办公室」而不是 Link 标识 */
  const departmentDisplay = departmentLabel(targets[0].flowDepartment);
  const batchIdempotencyKey = getResultEmailBatchIdempotencyKey({
    flowId,
    accept,
    userFlowIds: missingTargets.map((item) => item.userFlowId),
  });

  const deliveryDrafts = await Promise.all(
    recipients.map(async (item) => {
      const toAddress = getEducationEmail(item.studentId);
      const rendered = await renderEmailTemplate({
        templateKey,
        variables: {
          name: item.name,
          flowName: item.flowName,
          flowKind,
          round: flowRound,
          department: departmentDisplay,
          groupNumber: templateSetting.groupNumber,
          setting: templateSetting,
        },
        department,
      });

      return {
        item,
        toAddress,
        rendered,
      };
    }),
  );
  /* 批次级主题不落到某一位候选人身上：{name} 留空，投递各自保存渲染后的真实标题 */
  const batchSubject = renderResultEmailSubject(
    {
      name: "",
      flowName: targets[0].flowName,
      department: departmentDisplay,
      groupNumber: templateSetting.groupNumber,
    },
    templateSetting,
  );

  return db.transaction(async (tx) => {
    const [batch] = await tx
      .insert(emailBatch)
      .values({
        idempotencyKey: batchIdempotencyKey,
        templateKey,
        category: "result",
        name: `${targets[0].flowName} ${accept ? "通过" : "不通过"}通知`,
        subject: batchSubject,
        accept,
        status: "draft",
        totalCount: missingTargets.length,
        fkFlowId: flowId,
        fkCreatedBy: createdBy,
        metadata: { accept },
      })
      .onConflictDoNothing({ target: emailBatch.idempotencyKey })
      .returning({ id: emailBatch.id });

    if (!batch) {
      const [existingBatch] = await tx
        .select({ id: emailBatch.id })
        .from(emailBatch)
        .where(eq(emailBatch.idempotencyKey, batchIdempotencyKey))
        .limit(1);

      return { batchId: existingBatch?.id ?? null, deliveryCount: 0 };
    }

    let deliveryCount = 0;
    for (const { item, rendered, toAddress } of deliveryDrafts) {
      const [delivery] = await tx
        .insert(emailDelivery)
        .values({
          idempotencyKey: item.idempotencyKey,
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
        .onConflictDoNothing({ target: emailDelivery.idempotencyKey })
        .returning({ id: emailDelivery.id });
      if (delivery) deliveryCount += 1;
    }

    return { batchId: batch.id, deliveryCount };
  });
}

/**
 * 办公类部门面试招新的一面结果通知：
 * - accept=true：发给「一面已通过、正在二面阶段」的候选人；
 * - accept=false：发给「一面未通过、停在第一阶段」的候选人。
 * 模板与 `{groupNumber}` 按本流程归属部门解析（部门覆盖 → 全局默认 → 内置默认）。
 * 与最终结果发布解耦（一面结果不改变报名状态），单独成批、单独入队，
 * 并通过独立的去重作用域避免与最终结果批次互相覆盖。返回 null 表示当前没有可发送的候选人。
 */
export async function createOfficeRoundOneEmailBatch({
  flowId,
  createdBy,
  accept,
}: {
  flowId: number;
  createdBy: number;
  accept: boolean;
}): Promise<{ batchId: number; recipientCount: number } | null> {
  assertEmailConfigured();
  const [flowRow] = await db
    .select({ id: flow.id, title: flow.title, department: flow.department })
    .from(flow)
    .where(eq(flow.id, flowId))
    .limit(1);
  if (!flowRow) throw new Error("流程不存在");
  /* 每个办公部门一条独立流程：模板归属 = 流程归属部门 */
  const flowDepartment = normalizeDepartmentKey(flowRow.department);
  const departmentDisplay = departmentLabel(flowRow.department);

  const round = 1;
  /* 通过 / 未通过各自独立的去重作用域，避免互相覆盖 */
  const scope = accept ? "office_round1" : "office_round1_rejected";
  const templateKey = getResultEmailTemplateKey(
    OFFICE_INTERVIEW_FLOW_TYPE,
    accept,
    round,
  );

  const recipientRows = await db
    .select({
      userFlowId: userFlow.id,
      userId: userFlow.fkUserId,
    })
    .from(userFlow)
    .where(
      and(
        eq(userFlow.fkFlowId, flowId),
        /* 通过：一面通过后已进入二面阶段；未通过：停在第一阶段且已判定不通过 */
        accept
          ? and(
              eq(userFlow.progressStatus, "ongoing"),
              eq(userFlow.round, 2),
            )
          : and(eq(userFlow.progressStatus, "failed"), eq(userFlow.round, 1)),
      ),
    );
  if (recipientRows.length === 0) return null;

  const recipients = recipientRows.map((row) => ({
    ...row,
    idempotencyKey: getResultEmailDeliveryIdempotencyKey({
      flowId,
      accept,
      userFlowId: row.userFlowId,
      scope,
    }),
  }));

  /* 已发送 / 发送中的不再重复发送；pending / failed / dead 保留可重试 */
  const existingDeliveries = await db
    .select({
      batchId: emailDelivery.fkEmailBatchId,
      userFlowId: emailDelivery.fkUserFlowId,
      status: emailDelivery.status,
    })
    .from(emailDelivery)
    .where(
      inArray(
        emailDelivery.idempotencyKey,
        recipients.map((item) => item.idempotencyKey),
      ),
    );
  const existingByUserFlowId = new Map(
    existingDeliveries
      .filter(
        (item): item is typeof item & { userFlowId: number } =>
          item.userFlowId !== null,
      )
      .map((item) => [item.userFlowId, item]),
  );
  const queueableRecipients = recipients.filter((item) => {
    const existing = existingByUserFlowId.get(item.userFlowId);
    return !existing || (existing.status !== "sent" && existing.status !== "sending");
  });
  if (queueableRecipients.length === 0) return null;

  const queueableBatchIds = [
    ...new Set(
      queueableRecipients
        .map((item) => existingByUserFlowId.get(item.userFlowId)?.batchId)
        .filter((id): id is number => typeof id === "number"),
    ),
  ];
  const newRecipients = queueableRecipients.filter(
    (item) => !existingByUserFlowId.has(item.userFlowId),
  );

  let batchId: number | null = null;

  if (newRecipients.length > 0) {
    const userMap = await listPeopleUsersByLinkIds(
      newRecipients.map((item) => item.userId),
    );
    /* 收件人资料一次整理：姓名与学号都必须是真实值，缺任何一项都不发 */
    const recipients = newRecipients.map((item) => {
      const targetUser = userMap.get(item.userId);
      return {
        ...item,
        name: targetUser?.name?.trim() ?? "",
        studentId: targetUser?.studentId ?? null,
      };
    });
    const missingStudentIdRecipients = recipients.filter(
      (item) => !item.studentId?.trim(),
    );
    if (missingStudentIdRecipients.length > 0) {
      throw new Error(
        `以下同学缺少学号，无法生成教育邮箱：${missingStudentIdRecipients
          .map((item) => item.name || `Link 用户 #${item.userId}`)
          .join("、")}`,
      );
    }
    /* 称呼与主题都按真实姓名渲染（模板里的 {name}）：没有姓名的候选人不发，
       绝不能把「同学」这类非真实称呼发出去 */
    const missingNameRecipients = recipients.filter((item) => !item.name);
    if (missingNameRecipients.length > 0) {
      throw new Error(
        `以下同学缺少姓名，无法发送实名通知：${missingNameRecipients
          .map((item) => `Link 用户 #${item.userId}`)
          .join("、")}`,
      );
    }

    /* 模板按本流程归属部门解析：部门覆盖 → 全局默认 → 内置默认 */
    const setting = await readResultEmailTemplateSetting(templateKey, flowDepartment);

    const deliveryDrafts = await Promise.all(
      recipients.map(async (item) => {
        const rendered = await renderEmailTemplate({
          templateKey,
          variables: {
            name: item.name,
            flowName: flowRow.title,
            flowKind: getResultEmailFlowKind(OFFICE_INTERVIEW_FLOW_TYPE, round),
            round,
            department: departmentDisplay,
            groupNumber: setting.groupNumber,
            setting,
          },
          department: flowDepartment,
        });
        return {
          item,
          toAddress: getEducationEmail(item.studentId),
          rendered,
        };
      }),
    );

    /* 批次级主题不落到某一位候选人身上：{name} 留空，
       个人化只出现在每封投递自己的标题里（部门模板若写 {name} 也不会漏进列表） */
    const subject = renderResultEmailSubject(
      {
        name: "",
        flowName: flowRow.title,
        department: departmentDisplay,
        groupNumber: setting.groupNumber,
      },
      setting,
    );
    const batchIdempotencyKey = getResultEmailBatchIdempotencyKey({
      flowId,
      accept,
      userFlowIds: newRecipients.map((item) => item.userFlowId),
      scope,
    });

    batchId = await db.transaction(async (tx) => {
      const [batch] = await tx
        .insert(emailBatch)
        .values({
          idempotencyKey: batchIdempotencyKey,
          templateKey,
          category: "result",
          name: `${flowRow.title} ${accept ? "一面通过通知" : "一面不通过通知"}`,
          subject,
          accept,
          status: "draft",
          totalCount: newRecipients.length,
          fkFlowId: flowId,
          fkCreatedBy: createdBy,
          metadata: { accept, flowId, round, scope },
        })
        .onConflictDoNothing({ target: emailBatch.idempotencyKey })
        .returning({ id: emailBatch.id });

      if (!batch) {
        const [existingBatch] = await tx
          .select({ id: emailBatch.id })
          .from(emailBatch)
          .where(eq(emailBatch.idempotencyKey, batchIdempotencyKey))
          .limit(1);
        return existingBatch?.id ?? null;
      }

      for (const { item, rendered, toAddress } of deliveryDrafts) {
        await tx
          .insert(emailDelivery)
          .values({
            idempotencyKey: item.idempotencyKey,
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
            metadata: { accept, flowId, round, scope },
          })
          .onConflictDoNothing({ target: emailDelivery.idempotencyKey });
      }

      return batch.id;
    });
  }

  /* 入队只把投递置为待发送并触发事件，绝不改动候选人的报名状态 */
  const batchIdsToQueue = [
    ...new Set([
      ...(batchId === null ? [] : [batchId]),
      ...queueableBatchIds,
    ]),
  ];
  for (const id of batchIdsToQueue) {
    await sendEmailBatchById(id);
  }

  const resultBatchId = batchId ?? queueableBatchIds[0] ?? null;
  if (resultBatchId === null) return null;

  return { batchId: resultBatchId, recipientCount: queueableRecipients.length };
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
    (item) =>
      item.status === "pending" ||
      item.status === "failed" ||
      item.status === "dead",
  );

  if (queueableDeliveries.length === 0) {
    return { queuedCount: 0 };
  }

  await db
    .update(emailDelivery)
    .set({
      status: "pending",
      errorMessage: null,
      nextRetryAt: null,
      deadLetteredAt: null,
      updatedAt: new Date(),
    })
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

  /* 入队/重发只处理投递状态，绝不改报名状态：
     - 最终结果批次的收件人在建批次时就已经是 passed/failed（createResultEmailBatch 按 sourceStatus 选人）；
     - 一面通过通知的收件人仍在二面流程中（ongoing + round 2），重试时把她们标成 passed
       会让她们跳过二面决定（closeOfficeRoundTwo 只找 ongoing 的二面候选人）。 */
  try {
    await runWithConcurrency(
      queueableDeliveries,
      BATCH_SEND_CONCURRENCY,
      async (item) => {
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
                nextRetryAt: new Date(),
                deadLetteredAt: null,
                updatedAt: new Date(),
              })
              .where(eq(emailDelivery.id, item.id));
            throw new Error(EMAIL_SERVICE_UNAVAILABLE);
          }

          await sendEmailDelivery(item.id, { trigger: "batch_fallback" });
        }
      },
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
      nextRetryAt: new Date(),
      deadLetteredAt: null,
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
