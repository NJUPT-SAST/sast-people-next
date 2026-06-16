"use server";

import { batchSendEmail } from "@/action/user/sendEmail";
import { sendEmailBatch } from "@/action/email/send";
import { getEmailTemplateSetting } from "@/action/email/template";
import { db } from "@/db/drizzle";
import { emailBatch, emailDelivery, flow, userFlow } from "@/db/schema";
import { verifyRole } from "@/lib/dal";
import {
  requireBooleanInput,
  requirePositiveIntegerInput,
} from "@/lib/email-center/action-input";
import { listPeopleUsersByLinkIds } from "@/lib/link/user-lookup";
import { getResultEmailTemplateKey } from "@/lib/email/result-email";
import { renderEmailTemplate } from "@/lib/email-center/render";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";

export async function listEmailFlowTargets() {
  await verifyRole(3);

  const flows = await db
    .select({
      id: flow.id,
      title: flow.title,
      type: flow.type,
      createdAt: flow.createdAt,
    })
    .from(flow)
    .where(and(eq(flow.isDeleted, false), eq(flow.type, "recruitment")))
    .orderBy(desc(flow.createdAt));

  if (flows.length === 0) return [];

  const acceptedSetting = await getEmailTemplateSetting(getResultEmailTemplateKey(true));
  const rejectedSetting = await getEmailTemplateSetting(getResultEmailTemplateKey(false));

  const targets = await db
    .select({
      flowId: userFlow.fkFlowId,
      userFlowId: userFlow.id,
      userId: userFlow.fkUserId,
      progressStatus: userFlow.progressStatus,
    })
    .from(userFlow)
    .where(
      and(
        inArray(userFlow.fkFlowId, flows.map((item) => item.id)),
        inArray(userFlow.progressStatus, ["passed", "failed"]),
      ),
    );

  const userMap = await listPeopleUsersByLinkIds(targets.map((item) => item.userId));
  const hydratedTargets = targets.map((target) => ({
    ...target,
    status: target.progressStatus ?? "not_started",
    name: userMap.get(target.userId)?.name ?? "同学",
    studentId: userMap.get(target.userId)?.studentId ?? null,
  }));

  return Promise.all(flows.map(async (item) => {
    const flowTargets = hydratedTargets.filter((target) => target.flowId === item.id);
    const passed = flowTargets.filter((t) => t.status === "passed");
    const failed = flowTargets.filter((t) => t.status === "failed");
    const acceptedPreview = passed[0]
      ? await renderEmailTemplate({
          templateKey: getResultEmailTemplateKey(true),
          variables: {
            name: passed[0].name,
            flowName: item.title,
            setting: acceptedSetting,
            genericGreeting: true,
          },
        })
      : null;
    const rejectedPreview = failed[0]
      ? await renderEmailTemplate({
          templateKey: getResultEmailTemplateKey(false),
          variables: {
            name: failed[0].name,
            flowName: item.title,
            setting: rejectedSetting,
            genericGreeting: true,
          },
        })
      : null;

    return {
      ...item,
      passed,
      failed,
      accepted: passed,
      rejected: failed,
      acceptedSubject: acceptedPreview?.subject ?? `${item.title} 结果通知`,
      rejectedSubject: rejectedPreview?.subject ?? `${item.title} 结果通知`,
      acceptedPreviewHtml: acceptedPreview?.html ?? null,
      rejectedPreviewHtml: rejectedPreview?.html ?? null,
    };
  }));
}

export async function createResultEmailBatchFromFlow(
  flowIdInput: unknown,
  acceptInput: unknown,
) {
  await verifyRole(3);
  const flowId = requirePositiveIntegerInput(flowIdInput, "流程 ID");
  const accept = requireBooleanInput(acceptInput, "结果通知类型");
  const sourceStatus = accept ? "passed" : "failed";
  const rows = await db
    .select({ userFlowId: userFlow.id, userId: userFlow.fkUserId })
    .from(userFlow)
    .where(and(eq(userFlow.fkFlowId, flowId), eq(userFlow.progressStatus, sourceStatus)));

  if (rows.length === 0) return { batchId: null, deliveryCount: 0 };

  const existingDeliveries = await db
    .select({ batchId: emailDelivery.fkEmailBatchId, userFlowId: emailDelivery.fkUserFlowId, status: emailDelivery.status })
    .from(emailDelivery)
    .innerJoin(emailBatch, eq(emailBatch.id, emailDelivery.fkEmailBatchId))
    .where(and(eq(emailBatch.fkFlowId, flowId), eq(emailBatch.accept, accept), inArray(emailDelivery.fkUserFlowId, rows.map((item) => item.userFlowId))))
    .orderBy(asc(emailDelivery.createdAt));

  const reusableDelivery = existingDeliveries.find(
    (item) =>
      item.status === "pending" ||
      item.status === "failed" ||
      item.status === "dead",
  );
  if (reusableDelivery) return { batchId: reusableDelivery.batchId, deliveryCount: 0 };

  const existingUserFlowIds = new Set(existingDeliveries.map((item) => item.userFlowId));
  const rowsWithoutDelivery = rows.filter((item) => !existingUserFlowIds.has(item.userFlowId));
  if (rowsWithoutDelivery.length === 0) return { batchId: null, deliveryCount: 0 };

  const result = await batchSendEmail(rowsWithoutDelivery.map((item) => item.userId), flowId, accept);
  revalidatePath("/dashboard/emails");
  return result;
}

export async function sendResultEmailFromFlow(
  flowIdInput: unknown,
  acceptInput: unknown,
) {
  await verifyRole(3);
  const flowId = requirePositiveIntegerInput(flowIdInput, "流程 ID");
  const accept = requireBooleanInput(acceptInput, "结果通知类型");
  const batch = await createResultEmailBatchFromFlow(flowId, accept);
  if (!batch.batchId) return { batchId: null, queuedCount: 0 };
  const sent = await sendEmailBatch(batch.batchId);
  revalidatePath("/dashboard/emails");
  return { batchId: batch.batchId, queuedCount: sent.queuedCount };
}
