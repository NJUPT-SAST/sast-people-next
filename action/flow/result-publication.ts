"use server";

import { createResultEmailBatch } from "@/lib/email-center/batch";
import { sendEmailBatch } from "@/action/email/send";
import { readResultEmailTemplateSetting } from "@/lib/email-center/template-resolution";
import { db } from "@/db/drizzle";
import { flow, flowResultPublication, interviewEvaluation, userFlow } from "@/db/schema";
import { verifyManager } from "@/lib/authz";
import { assertFlowEditableRecord, canEditFlowRecord } from "@/lib/flow-access";
import { isOfficeInterviewFlow, OFFICE_INTERVIEW_FLOW_TYPE } from "@/const/flow";
import { writeOperationAudit } from "@/lib/operation-audit";
import { listPeopleUsersByLinkIds } from "@/lib/link/user-lookup";
import { syncUserIdentityFromAcceptedFlows } from "@/action/user-flow/roleTransition";
import { getResultEmailTemplateKey } from "@/lib/email/result-email";
import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

const terminalStatuses = new Set(["passed", "failed", "withdrawn"]);

type ResultSnapshotRow = {
  userFlowId: number;
  userId: number;
  name: string;
  studentId: string | null;
  applyGroup: string | null;
  status: string;
  department: string | null;
  /* 办公类部门面试：志愿类型与部长团评议的最终去向 */
  choice: number | null;
  /** 候选人当前所处轮次：1=一面、2=二面（其他流程为空） */
  round: number | null;
  finalDepartment: string | null;
  /** 办公类部门面试：部长安排的面试时段（留档用，导出结果表时可见） */
  interviewSlot: string | null;
  /** 候选人当前轮（办公类=二面）已记录的面试分数，用于名单确认时核对面试记录 */
  scores: number[];
  /**
   * 分轮面评均分与份数：一面=单人终评、二面=多位部长分别打分。
   * 均分保留 1 位小数（无记录为 null），只统计已提交/已通过的面评，与面试管理工作台口径一致。
   * 旧版本快照没有这几个字段，读取方需按缺失回退。
   */
  round1Average: number | null;
  round1Count: number;
  round2Average: number | null;
  round2Count: number;
  /** 该候选人在办公类各流程的报名（用于最终去向选择） */
  officeChoices: Array<{
    userFlowId: number;
    choice: number | null;
    department: string | null;
    flowTitle: string;
  }>;
};

/**
 * 分轮面评统计：均分保留 1 位小数（整数自然不带小数），无记录时均分为 null。
 * 一面由一位部长给最终分、二面由 2-3 位部长分别打分，因此两轮要分开统计。
 */
function roundScoreStatistics(scores: number[]) {
  if (scores.length === 0) return { average: null as number | null, count: 0 };
  const total = scores.reduce((sum, score) => sum + score, 0);
  return { average: Math.round((total / scores.length) * 10) / 10, count: scores.length };
}

async function getFlowRows(flowId: number, flowType: string) {
  const rows = await db
    .select({
      userFlowId: userFlow.id,
      userId: userFlow.fkUserId,
      applyGroup: userFlow.applyGroup,
      status: userFlow.progressStatus,
      department: userFlow.department,
      choice: userFlow.choice,
      round: userFlow.round,
      finalDepartment: userFlow.finalDepartment,
      /* 留档：办公类候选人的面试时段 */
      interviewSlot: userFlow.interviewSlot,
    })
    .from(userFlow)
    .where(eq(userFlow.fkFlowId, flowId));
  const users = await listPeopleUsersByLinkIds(rows.map((row) => row.userId));

  /* 办公类：名单确认要核对当前轮（二面）记录，结果快照还要留档两轮的均分与份数 */
  const scoresByUserFlow = new Map<number, number[]>();
  const roundOneScoresByUserFlow = new Map<number, number[]>();
  const roundTwoScoresByUserFlow = new Map<number, number[]>();
  if (isOfficeInterviewFlow(flowType) && rows.length > 0) {
    const scoreRows = await db
      .select({
        userFlowId: interviewEvaluation.fkUserFlowId,
        round: interviewEvaluation.round,
        status: interviewEvaluation.status,
        score: interviewEvaluation.score,
      })
      .from(interviewEvaluation)
      .where(
        and(
          inArray(
            interviewEvaluation.fkUserFlowId,
            rows.map((row) => row.userFlowId),
          ),
          inArray(interviewEvaluation.round, [1, 2]),
          isNotNull(interviewEvaluation.score),
        ),
      )
      .orderBy(interviewEvaluation.id);
    for (const scoreRow of scoreRows) {
      if (scoreRow.score === null) continue;
      /* 当前轮（二面）分数沿用原语义：只要打了分就带出，退回/历史记录也照样给名单确认核对 */
      if (scoreRow.round === 2) {
        const list = scoresByUserFlow.get(scoreRow.userFlowId) ?? [];
        list.push(scoreRow.score);
        scoresByUserFlow.set(scoreRow.userFlowId, list);
      }
      /* 分轮均分只统计已提交/已通过的面评，退回重写与历史不通过不计入 */
      if (scoreRow.status !== "submitted" && scoreRow.status !== "approved") continue;
      const roundScores =
        scoreRow.round === 1 ? roundOneScoresByUserFlow : roundTwoScoresByUserFlow;
      const list = roundScores.get(scoreRow.userFlowId) ?? [];
      list.push(scoreRow.score);
      roundScores.set(scoreRow.userFlowId, list);
    }
  }

  /* 办公类：补充该候选人两个志愿部门的报名信息，供发布前设置最终去向 */
  const officeChoicesByUser = new Map<
    number,
    ResultSnapshotRow["officeChoices"]
  >();
  if (isOfficeInterviewFlow(flowType) && rows.length > 0) {
    const officeRows = await db
      .select({
        userFlowId: userFlow.id,
        userId: userFlow.fkUserId,
        choice: userFlow.choice,
        rowDepartment: userFlow.department,
        flowDepartment: flow.department,
        flowTitle: flow.title,
      })
      .from(userFlow)
      .innerJoin(flow, eq(userFlow.fkFlowId, flow.id))
      .where(
        and(
          inArray(userFlow.fkUserId, rows.map((row) => row.userId)),
          eq(flow.type, OFFICE_INTERVIEW_FLOW_TYPE),
          eq(flow.isDeleted, false),
        ),
      );
    for (const officeRow of officeRows) {
      const list = officeChoicesByUser.get(officeRow.userId) ?? [];
      list.push({
        userFlowId: officeRow.userFlowId,
        choice: officeRow.choice,
        department: officeRow.flowDepartment ?? officeRow.rowDepartment,
        flowTitle: officeRow.flowTitle,
      });
      officeChoicesByUser.set(officeRow.userId, list);
    }
    for (const list of officeChoicesByUser.values()) {
      list.sort((a, b) => (a.choice ?? 9) - (b.choice ?? 9));
    }
  }

  return rows.map<ResultSnapshotRow>((row) => {
    const user = users.get(row.userId);
    const roundOne = roundScoreStatistics(
      roundOneScoresByUserFlow.get(row.userFlowId) ?? [],
    );
    const roundTwo = roundScoreStatistics(
      roundTwoScoresByUserFlow.get(row.userFlowId) ?? [],
    );
    return {
      userFlowId: row.userFlowId,
      userId: row.userId,
      name: user?.name ?? "未知用户",
      studentId: user?.studentId ?? null,
      applyGroup: row.applyGroup ?? null,
      status: row.status ?? "not_started",
      department: row.department ?? null,
      choice: row.choice ?? null,
      round: row.round ?? null,
      finalDepartment: row.finalDepartment ?? null,
      interviewSlot: row.interviewSlot ?? null,
      scores: scoresByUserFlow.get(row.userFlowId) ?? [],
      round1Average: roundOne.average,
      round1Count: roundOne.count,
      round2Average: roundTwo.average,
      round2Count: roundTwo.count,
      officeChoices: officeChoicesByUser.get(row.userId) ?? [],
    };
  });
}

export async function getFlowResultPublicationSummary(flowId: number) {
  const session = await verifyManager();
  const [flowRow, publication] = await Promise.all([
    db.select({ id: flow.id, title: flow.title, type: flow.type, department: flow.department, createdAt: flow.createdAt }).from(flow).where(and(eq(flow.id, flowId), eq(flow.isDeleted, false))).limit(1),
    db.select().from(flowResultPublication).where(eq(flowResultPublication.fkFlowId, flowId)).limit(1),
  ]);
  if (!flowRow[0]) throw new Error("流程不存在");
  assertFlowEditableRecord(session.scope, flowRow[0]);
  /* 办公类流程一次性发布的是二轮（最终）结果，模板按二轮解析；其他流程类型不区分轮次 */
  const resultRound = isOfficeInterviewFlow(flowRow[0].type) ? 2 : null;
  const rows = await getFlowRows(flowId, flowRow[0].type);
  const accepted = rows.filter((row) => row.status === "passed").length;
  const rejected = rows.filter((row) => row.status === "failed").length;
  const withdrawn = rows.filter((row) => row.status === "withdrawn").length;
  const unfinished = rows.filter((row) => !terminalStatuses.has(row.status)).length;
  const [acceptedTemplate, rejectedTemplate] = await Promise.all([
    readResultEmailTemplateSetting(getResultEmailTemplateKey(flowRow[0].type, true, resultRound), flowRow[0].department),
    readResultEmailTemplateSetting(getResultEmailTemplateKey(flowRow[0].type, false, resultRound), flowRow[0].department),
  ]);
  return {
    flow: flowRow[0],
    isOfficeFlow: isOfficeInterviewFlow(flowRow[0].type),
    rows,
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

export async function publishFlowResults(
  flowId: number,
  confirmTemplate: boolean,
  recipientUserFlowIds?: number[],
) {
  const session = await verifyManager();
  if (!confirmTemplate) throw new Error("发布前必须确认本年度通过和不通过邮件模板");
  const summary = await getFlowResultPublicationSummary(flowId);
  assertFlowEditableRecord(session.scope, summary.flow);
  const resultRound = isOfficeInterviewFlow(summary.flow.type) ? 2 : null;
  if (summary.publication?.status === "published") throw new Error("该流程结果已经发布");
  if (summary.counts.unfinished > 0) throw new Error(`还有 ${summary.counts.unfinished} 名候选人没有最终结果，暂不能发布`);

  const rows = await getFlowRows(flowId, summary.flow.type);
  const selectableUserFlowIds = new Set(
    rows
      .filter((row) => row.status === "passed" || row.status === "failed")
      .map((row) => row.userFlowId),
  );
  const selectedUserFlowIds = recipientUserFlowIds === undefined
    ? selectableUserFlowIds
    : new Set(recipientUserFlowIds.filter((id) => selectableUserFlowIds.has(id)));
  const acceptedTemplate = await readResultEmailTemplateSetting(getResultEmailTemplateKey(summary.flow.type, true, resultRound), summary.flow.department);
  const rejectedTemplate = await readResultEmailTemplateSetting(getResultEmailTemplateKey(summary.flow.type, false, resultRound), summary.flow.department);
  const resultSnapshot = {
    flowId,
    flowTitle: summary.flow.title,
    rows,
    counts: summary.counts,
    notifiedUserFlowIds: [...selectedUserFlowIds],
  };
  const templateSnapshot = {
    accepted: { ...acceptedTemplate, updatedAt: acceptedTemplate.updatedAt?.toISOString() ?? null },
    rejected: { ...rejectedTemplate, updatedAt: rejectedTemplate.updatedAt?.toISOString() ?? null },
  };
  const now = new Date();
  const [existingPublication] = await db
    .select({ id: flowResultPublication.id, status: flowResultPublication.status, version: flowResultPublication.version })
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
      }).where(and(
        eq(flowResultPublication.id, existingPublication.id),
        eq(flowResultPublication.status, "failed"),
        eq(flowResultPublication.version, existingPublication.version),
      )).returning({ id: flowResultPublication.id })
    : await db.insert(flowResultPublication).values({
        fkFlowId: flowId,
        status: "publishing",
        resultSnapshot,
        templateSnapshot,
        confirmedBy: session.uid,
      confirmedAt: now,
    }).returning({ id: flowResultPublication.id });

  if (!publication) {
    throw new Error("该流程结果状态已变更，请刷新后重试");
  }

  try {
    await syncUserIdentityFromAcceptedFlows(rows.filter((row) => row.status === "passed").map((row) => row.userId), flowId);
    const acceptedRows = rows.filter(
      (row) => row.status === "passed" && selectedUserFlowIds.has(row.userFlowId),
    );
    const rejectedRows = rows.filter(
      (row) => row.status === "failed" && selectedUserFlowIds.has(row.userFlowId),
    );
    const acceptedBatch = await createResultEmailBatch({
      userIds: acceptedRows.map((row) => row.userId),
      userFlowIds: acceptedRows.map((row) => row.userFlowId),
      flowId,
      flowType: summary.flow.type,
      accept: true,
      createdBy: session.uid,
      department: summary.flow.department,
      templateSetting: acceptedTemplate,
    });
    const rejectedBatch = await createResultEmailBatch({
      userIds: rejectedRows.map((row) => row.userId),
      userFlowIds: rejectedRows.map((row) => row.userFlowId),
      flowId,
      flowType: summary.flow.type,
      accept: false,
      createdBy: session.uid,
      department: summary.flow.department,
      templateSetting: rejectedTemplate,
    });
    await Promise.all([acceptedBatch.batchId ? sendEmailBatch(acceptedBatch.batchId) : null, rejectedBatch.batchId ? sendEmailBatch(rejectedBatch.batchId) : null]);
    const [publishedPublication] = await db.update(flowResultPublication)
      .set({ status: "published", publishedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(flowResultPublication.id, publication.id), eq(flowResultPublication.status, "publishing")))
      .returning({ id: flowResultPublication.id });
    if (!publishedPublication) throw new Error("流程发布状态已变更，请刷新后确认结果");
    await writeOperationAudit({ actorId: session.uid, actorRole: session.realRole, action: "flow.result.publish", resourceType: "flow_result_publication", resourceId: publication.id, department: summary.flow.department, metadata: { flowId, counts: summary.counts, notifiedUserFlowIds: [...selectedUserFlowIds] } });
    revalidatePath("/dashboard/exams");
    revalidatePath("/dashboard/interviews");
    revalidatePath("/dashboard/emails");
    return { publicationId: publication.id, counts: summary.counts };
  } catch (error) {
    await db.update(flowResultPublication)
      .set({ status: "failed", updatedAt: new Date() })
      .where(and(eq(flowResultPublication.id, publication.id), eq(flowResultPublication.status, "publishing")));
    await syncUserIdentityFromAcceptedFlows(
      rows.filter((row) => row.status === "passed").map((row) => row.userId),
    );
    throw error;
  }
}

export async function getPublishedFlowResult(flowId: number) {
  const session = await verifyManager();
  const [flowRow] = await db
    .select({ department: flow.department, type: flow.type })
    .from(flow)
    .where(eq(flow.id, flowId))
    .limit(1);
  if (!flowRow || !canEditFlowRecord(session.scope, flowRow)) return null;
  const [publication] = await db.select().from(flowResultPublication).where(and(eq(flowResultPublication.fkFlowId, flowId), eq(flowResultPublication.status, "published"))).limit(1);
  return publication ?? null;
}
