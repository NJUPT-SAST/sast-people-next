"use server";

import { createResultEmailBatch } from "@/lib/email-center/batch";
import { sendEmailBatch } from "@/action/email/send";
import { getEmailTemplateSetting } from "@/action/email/template";
import { db } from "@/db/drizzle";
import { flow, flowResultPublication, userFlow } from "@/db/schema";
import { verifyRole } from "@/lib/dal";
import { writeOperationAudit } from "@/lib/operation-audit";
import { listPeopleUsersByLinkIds } from "@/lib/link/user-lookup";
import { syncUserRolesFromAcceptedFlows } from "@/action/user-flow/roleTransition";
import { getResultEmailTemplateKey } from "@/lib/email/result-email";
import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

const terminalStatuses = new Set(["passed", "failed", "withdrawn"]);

type ResultSnapshotRow = {
  userFlowId: number;
  userId: number;
  name: string;
  studentId: string | null;
  applyGroup: string | null;
  status: string;
};

async function getFlowRows(flowId: number) {
  const rows = await db
    .select({
      userFlowId: userFlow.id,
      userId: userFlow.fkUserId,
      applyGroup: userFlow.applyGroup,
      status: userFlow.progressStatus,
    })
    .from(userFlow)
    .where(eq(userFlow.fkFlowId, flowId));
  const users = await listPeopleUsersByLinkIds(rows.map((row) => row.userId));
  return rows.map<ResultSnapshotRow>((row) => {
    const user = users.get(row.userId);
    return {
      userFlowId: row.userFlowId,
      userId: row.userId,
      name: user?.name ?? "未知用户",
      studentId: user?.studentId ?? null,
      applyGroup: row.applyGroup ?? null,
      status: row.status ?? "not_started",
    };
  });
}

export async function getFlowResultPublicationSummary(flowId: number) {
  await verifyRole(3);
  const [flowRow, publication] = await Promise.all([
    db.select({ id: flow.id, title: flow.title, type: flow.type, createdAt: flow.createdAt }).from(flow).where(and(eq(flow.id, flowId), eq(flow.isDeleted, false))).limit(1),
    db.select().from(flowResultPublication).where(eq(flowResultPublication.fkFlowId, flowId)).limit(1),
  ]);
  if (!flowRow[0]) throw new Error("流程不存在");
  const rows = await getFlowRows(flowId);
  const accepted = rows.filter((row) => row.status === "passed").length;
  const rejected = rows.filter((row) => row.status === "failed").length;
  const withdrawn = rows.filter((row) => row.status === "withdrawn").length;
  const unfinished = rows.filter((row) => !terminalStatuses.has(row.status)).length;
  const [acceptedTemplate, rejectedTemplate] = await Promise.all([
    getEmailTemplateSetting(getResultEmailTemplateKey(true)),
    getEmailTemplateSetting(getResultEmailTemplateKey(false)),
  ]);
  return {
    flow: flowRow[0],
    counts: { total: rows.length, accepted, rejected, withdrawn, unfinished },
    publication: publication[0] ?? null,
    templates: {
      accepted: {
        templateKey: acceptedTemplate.templateKey,
        updatedAt: acceptedTemplate.updatedAt?.toISOString() ?? null,
        needsReview: !acceptedTemplate.updatedAt || acceptedTemplate.updatedAt < flowRow[0].createdAt,
      },
      rejected: {
        templateKey: rejectedTemplate.templateKey,
        updatedAt: rejectedTemplate.updatedAt?.toISOString() ?? null,
        needsReview: !rejectedTemplate.updatedAt || rejectedTemplate.updatedAt < flowRow[0].createdAt,
      },
    },
  };
}

export async function publishFlowResults(flowId: number, confirmTemplate: boolean) {
  const session = await verifyRole(3);
  if (!confirmTemplate) throw new Error("发布前必须确认本年度通过和不通过邮件模板");
  const summary = await getFlowResultPublicationSummary(flowId);
  if (summary.publication?.status === "published") throw new Error("该流程结果已经发布");
  if (summary.counts.unfinished > 0) throw new Error(`还有 ${summary.counts.unfinished} 名候选人没有最终结果，暂不能发布`);

  const rows = await getFlowRows(flowId);
  const acceptedTemplate = await getEmailTemplateSetting(getResultEmailTemplateKey(true));
  const rejectedTemplate = await getEmailTemplateSetting(getResultEmailTemplateKey(false));
  const resultSnapshot = { flowId, flowTitle: summary.flow.title, rows, counts: summary.counts };
  const templateSnapshot = {
    accepted: { ...acceptedTemplate, updatedAt: acceptedTemplate.updatedAt?.toISOString() ?? null },
    rejected: { ...rejectedTemplate, updatedAt: rejectedTemplate.updatedAt?.toISOString() ?? null },
  };
  const now = new Date();
  const [existingPublication] = await db
    .select({ id: flowResultPublication.id, status: flowResultPublication.status })
    .from(flowResultPublication)
    .where(eq(flowResultPublication.fkFlowId, flowId))
    .limit(1);
  if (existingPublication?.status === "published") throw new Error("该流程结果已经发布");
  if (existingPublication?.status === "publishing") throw new Error("该流程正在发布，请稍候");
  const [publication] = existingPublication
    ? await db.update(flowResultPublication).set({
        status: "publishing",
        version: sql`version + 1`,
        resultSnapshot,
        templateSnapshot,
        confirmedBy: session.uid,
        confirmedAt: now,
        publishedAt: null,
        updatedAt: now,
      }).where(eq(flowResultPublication.id, existingPublication.id)).returning({ id: flowResultPublication.id })
    : await db.insert(flowResultPublication).values({
        fkFlowId: flowId,
        status: "publishing",
        resultSnapshot,
        templateSnapshot,
        confirmedBy: session.uid,
        confirmedAt: now,
      }).returning({ id: flowResultPublication.id });

  try {
    await syncUserRolesFromAcceptedFlows(rows.filter((row) => row.status === "passed").map((row) => row.userId), flowId);
    const acceptedBatch = await createResultEmailBatch({ userIds: rows.filter((row) => row.status === "passed").map((row) => row.userId), flowId, accept: true, createdBy: session.uid });
    const rejectedBatch = await createResultEmailBatch({ userIds: rows.filter((row) => row.status === "failed").map((row) => row.userId), flowId, accept: false, createdBy: session.uid });
    await Promise.all([acceptedBatch.batchId ? sendEmailBatch(acceptedBatch.batchId) : null, rejectedBatch.batchId ? sendEmailBatch(rejectedBatch.batchId) : null]);
    await db.update(flowResultPublication).set({ status: "published", publishedAt: new Date(), updatedAt: new Date() }).where(eq(flowResultPublication.id, publication.id));
    await writeOperationAudit({ actorId: session.uid, actorRole: session.role, action: "flow.result.publish", resourceType: "flow_result_publication", resourceId: publication.id, metadata: { flowId, counts: summary.counts } });
    revalidatePath("/dashboard/exams");
    revalidatePath("/dashboard/interviews");
    revalidatePath("/dashboard/emails");
    return { publicationId: publication.id, counts: summary.counts };
  } catch (error) {
    await db.update(flowResultPublication).set({ status: "failed", updatedAt: new Date() }).where(eq(flowResultPublication.id, publication.id));
    throw error;
  }
}

export async function getPublishedFlowResult(flowId: number) {
  await verifyRole(3);
  const [publication] = await db.select().from(flowResultPublication).where(and(eq(flowResultPublication.fkFlowId, flowId), eq(flowResultPublication.status, "published"))).limit(1);
  return publication ?? null;
}
