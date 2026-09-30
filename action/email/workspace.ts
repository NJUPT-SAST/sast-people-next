"use server";

import { batchSendEmail } from "@/action/user/sendEmail";
import { sendEmailBatch } from "@/action/email/send";
import { getEmailTemplateSetting } from "@/action/email/template";
import { db } from "@/db/drizzle";
import { flow, flowResultPublication, userFlow } from "@/db/schema";
import { getDepartmentScope, type DepartmentScope, verifyManager } from "@/lib/authz";
import { assertFlowEditableRecord, visibleFlowPredicate } from "@/lib/flow-access";
import { verifyRole } from "@/lib/dal";
import { isOfficeInterviewFlow, OFFICE_INTERVIEW_FLOW_TYPE } from "@/const/flow";
import { departmentLabel } from "@/const/department";
import {
  requireBooleanInput,
  requirePositiveIntegerInput,
} from "@/lib/email-center/action-input";
import { listPeopleUsersByLinkIds } from "@/lib/link/user-lookup";
import { getResultEmailTemplateKey } from "@/lib/email/result-email";
import { renderEmailTemplate } from "@/lib/email-center/render";
import { and, desc, eq, inArray, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { assertFlowResultsPublished } from "@/lib/flow-result-publication-guard";

const resultFlowTypes = [
  "recruitment",
  "recruitment_exemption",
  "woc",
  "soc",
  OFFICE_INTERVIEW_FLOW_TYPE,
] as const;

/* 邮件批次归属于流程：只有流程归属部门、管理员或办公类共享流程的办公部门可以创建 / 发送 */
async function assertFlowEmailEditable(scope: DepartmentScope, flowId: number) {
  const [sourceFlow] = await db
    .select({ type: flow.type, department: flow.department })
    .from(flow)
    .where(eq(flow.id, flowId))
    .limit(1);
  if (!sourceFlow) throw new Error("流程不存在");
  assertFlowEditableRecord(scope, sourceFlow, "无权为其他部门的流程发送邮件");
}

export async function listEmailFlowTargets() {
  await verifyRole(3);
  const scope = await getDepartmentScope();

  const flows = await db
    .select({
      id: flow.id,
      title: flow.title,
      type: flow.type,
      department: flow.department,
      createdAt: flow.createdAt,
    })
    .from(flow)
    .innerJoin(flowResultPublication, and(eq(flowResultPublication.fkFlowId, flow.id), eq(flowResultPublication.status, "published")))
    .where(
      and(
        eq(flow.isDeleted, false),
        inArray(flow.type, resultFlowTypes),
        /* 办公类部门面试招新的邮件在面试管理页单独发送，不混入通用发结果通道 */
        ne(flow.type, OFFICE_INTERVIEW_FLOW_TYPE),
        visibleFlowPredicate(scope),
      ),
    )
    .orderBy(desc(flow.createdAt));

  if (flows.length === 0) return [];

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
    /* 办公类共享流程发布的是二轮（最终）结果，模板与变量按二轮解析 */
    const resultRound = isOfficeInterviewFlow(item.type) ? 2 : null;
    const acceptedTemplateKey = getResultEmailTemplateKey(item.type, true, resultRound);
    const rejectedTemplateKey = getResultEmailTemplateKey(item.type, false, resultRound);
    const acceptedSetting = await getEmailTemplateSetting(acceptedTemplateKey, item.department);
    const rejectedSetting = await getEmailTemplateSetting(rejectedTemplateKey, item.department);
    /* 办公类模板需要 {department} 展示名，其他流程的模板变量用不到 */
    const departmentDisplay = departmentLabel(item.department);
    const flowTargets = hydratedTargets.filter((target) => target.flowId === item.id);
    const passed = flowTargets.filter((t) => t.status === "passed");
    const failed = flowTargets.filter((t) => t.status === "failed");
    const acceptedPreview = passed[0]
      ? await renderEmailTemplate({
          templateKey: acceptedTemplateKey,
          variables: {
            name: passed[0].name,
            flowName: item.title,
            round: resultRound,
            department: departmentDisplay,
            groupNumber: acceptedSetting.groupNumber,
            setting: acceptedSetting,
            genericGreeting: true,
          },
          department: item.department,
        })
      : null;
    const rejectedPreview = failed[0]
      ? await renderEmailTemplate({
          templateKey: rejectedTemplateKey,
          variables: {
            name: failed[0].name,
            flowName: item.title,
            round: resultRound,
            department: departmentDisplay,
            groupNumber: rejectedSetting.groupNumber,
            setting: rejectedSetting,
            genericGreeting: true,
          },
          department: item.department,
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

export async function listEmailFlowOptions() {
  await verifyRole(3);
  const scope = await getDepartmentScope();

  return db
    .select({
      id: flow.id,
      title: flow.title,
    })
    .from(flow)
    .where(and(eq(flow.isDeleted, false), inArray(flow.type, resultFlowTypes), visibleFlowPredicate(scope)))
    .orderBy(desc(flow.createdAt));
}

export async function createResultEmailBatchFromFlow(
  flowIdInput: unknown,
  acceptInput: unknown,
  excludedUserIdsInput?: unknown,
) {
  const { scope } = await verifyManager();
  const flowId = requirePositiveIntegerInput(flowIdInput, "流程 ID");
  const accept = requireBooleanInput(acceptInput, "结果通知类型");
  const excludedUserIds = excludedUserIdsInput === undefined
    ? []
    : Array.from(new Set(
        (Array.isArray(excludedUserIdsInput) ? excludedUserIdsInput : [])
          .map((value) => requirePositiveIntegerInput(value, "排除发送的用户 ID")),
      ));
  await assertFlowEmailEditable(scope, flowId);
  await assertFlowResultsPublished(flowId);
  const sourceStatus = accept ? "passed" : "failed";
  const rows = await db
    .select({ userFlowId: userFlow.id, userId: userFlow.fkUserId })
    .from(userFlow)
    .where(and(eq(userFlow.fkFlowId, flowId), eq(userFlow.progressStatus, sourceStatus)));

  const selectedRows = rows.filter((row) => !excludedUserIds.includes(row.userId));
  if (selectedRows.length === 0) return { batchId: null, deliveryCount: 0, excludedCount: rows.length };
  const excludedRows = rows.filter((row) => excludedUserIds.includes(row.userId));

  // createResultEmailBatch is the single deduplication boundary. It also
  // recognizes legacy deliveries that only retain fk_user_id.
  const result = await batchSendEmail(
    selectedRows.map((item) => item.userId),
    flowId,
    accept,
    excludedRows.map((item) => item.userId),
  );
  revalidatePath("/dashboard/emails");
  return { ...result, excludedCount: excludedRows.length };
}

export async function sendResultEmailFromFlow(
  flowIdInput: unknown,
  acceptInput: unknown,
  excludedUserIdsInput?: unknown,
) {
  const { scope } = await verifyManager();
  const flowId = requirePositiveIntegerInput(flowIdInput, "流程 ID");
  const accept = requireBooleanInput(acceptInput, "结果通知类型");
  await assertFlowEmailEditable(scope, flowId);
  const batch = await createResultEmailBatchFromFlow(flowId, accept, excludedUserIdsInput);
  if (!batch.batchId) return { batchId: null, queuedCount: 0, excludedCount: batch.excludedCount };
  const sent = await sendEmailBatch(batch.batchId);
  revalidatePath("/dashboard/emails");
  return { batchId: batch.batchId, queuedCount: sent.queuedCount, excludedCount: batch.excludedCount };
}
