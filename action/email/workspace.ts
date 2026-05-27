"use server";

import { batchSendEmail } from "@/action/user/sendEmail";
import { sendEmailBatch } from "@/action/email/send";
import { getEmailTemplateSetting } from "@/action/email/template";
import { db } from "@/db/drizzle";
import { flow, user, userFlow } from "@/db/schema";
import { verifyRole } from "@/lib/dal";
import {
  getResultEmailTemplateKey,
  renderResultEmail,
  renderResultEmailSubject,
} from "@/lib/email/result-email";
import { and, desc, eq, inArray } from "drizzle-orm";
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

  const targets = await db
    .select({
      flowId: userFlow.fkFlowId,
      userId: user.id,
      name: user.name,
      studentId: user.studentId,
      status: userFlow.status,
    })
    .from(userFlow)
    .innerJoin(user, eq(user.id, userFlow.fkUserId))
    .where(inArray(userFlow.status, ["passed", "failed"]));

  return Promise.all(flows.map(async (item) => {
    const flowTargets = targets.filter((target) => target.flowId === item.id);
    const passed = flowTargets.filter((target) => target.status === "passed");
    const failed = flowTargets.filter((target) => target.status === "failed");
    const acceptedSetting = await getEmailTemplateSetting(
      getResultEmailTemplateKey(true),
    );
    const rejectedSetting = await getEmailTemplateSetting(
      getResultEmailTemplateKey(false),
    );

    return {
      ...item,
      passed,
      failed,
      acceptedSubject: renderResultEmailSubject(item.title, acceptedSetting),
      rejectedSubject: renderResultEmailSubject(item.title, rejectedSetting),
      acceptedPreviewHtml: passed[0]
        ? await renderResultEmail({
            name: passed[0].name,
            flowName: item.title,
            accept: true,
            setting: acceptedSetting,
          })
        : null,
      rejectedPreviewHtml: failed[0]
        ? await renderResultEmail({
            name: failed[0].name,
            flowName: item.title,
            accept: false,
            setting: rejectedSetting,
          })
        : null,
    };
  }));
}

export async function createResultEmailBatchFromFlow(
  flowId: number,
  accept: boolean,
) {
  await verifyRole(3);

  const sourceStatus = accept ? "passed" : "failed";
  const rows = await db
    .select({ userId: userFlow.fkUserId })
    .from(userFlow)
    .where(and(eq(userFlow.fkFlowId, flowId), eq(userFlow.status, sourceStatus)));

  if (rows.length === 0) {
    return { batchId: null, deliveryCount: 0 };
  }

  const result = await batchSendEmail(
    rows.map((item) => item.userId),
    flowId,
    accept,
  );
  revalidatePath("/dashboard/emails");
  return result;
}

export async function sendResultEmailFromFlow(flowId: number, accept: boolean) {
  await verifyRole(3);

  const batch = await createResultEmailBatchFromFlow(flowId, accept);
  if (!batch.batchId) {
    return { batchId: null, queuedCount: 0 };
  }

  const sent = await sendEmailBatch(batch.batchId);
  revalidatePath("/dashboard/emails");
  return { batchId: batch.batchId, queuedCount: sent.queuedCount };
}
