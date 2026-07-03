"use server";

import { db } from "@/db/drizzle";
import {
  flow,
  interviewEvaluation,
  interviewSchedule,
  problem,
  userFlow,
  userPoint,
} from "@/db/schema";
import { generateTextWithOpenAI, AiConfigurationError } from "@/lib/ai/openai";
import { verifyRole } from "@/lib/dal";
import { getPeopleUserByLinkId, listPeopleUsersByLinkIds } from "@/lib/link/user-lookup";
import { logServerError } from "@/lib/server-error-log";
import { and, desc, eq } from "drizzle-orm";

const MAX_TEXT_LENGTH = 1800;

type AiActionResult =
  | { success: true; data: { text: string } }
  | { success: false; error: { message: string } };

function truncateText(value: string | null | undefined, maxLength = MAX_TEXT_LENGTH) {
  const text = value?.trim();
  if (!text) return null;
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

function compactStringArray(values: string[]) {
  return values.map((value) => value.trim()).filter(Boolean);
}

function formatDate(value: Date | string | null | undefined) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function getAiErrorResult(error: unknown): AiActionResult {
  if (error instanceof AiConfigurationError) {
    return { success: false, error: { message: error.message } };
  }

  if (error instanceof Error) {
    return { success: false, error: { message: error.message } };
  }

  return { success: false, error: { message: "AI 生成失败" } };
}

async function getUserFlowContextByUserId(userId: number) {
  const rows = await db
    .select({
      userFlowId: userFlow.id,
      progressStatus: userFlow.progressStatus,
      portfolioLink: userFlow.portfolioLink,
      flowTitle: flow.title,
      flowType: flow.type,
      flowDescription: flow.description,
      evaluationContent: interviewEvaluation.content,
      evaluationStatus: interviewEvaluation.status,
    })
    .from(userFlow)
    .leftJoin(flow, eq(userFlow.fkFlowId, flow.id))
    .leftJoin(
      interviewEvaluation,
      eq(interviewEvaluation.fkUserFlowId, userFlow.id),
    )
    .where(eq(userFlow.fkUserId, userId))
    .orderBy(desc(userFlow.createdAt));

  return rows.map((row) => ({
    flowTitle: row.flowTitle,
    flowType: row.flowType,
    flowDescription: truncateText(row.flowDescription, 500),
    progressStatus: row.progressStatus,
    portfolioLink: truncateText(row.portfolioLink, 500),
    evaluationStatus: row.evaluationStatus,
    evaluationContent: truncateText(row.evaluationContent, 700),
  }));
}

async function getCandidateContextByUserFlowId(userFlowId: number) {
  const [record] = await db
    .select({
      userId: userFlow.fkUserId,
      userFlowId: userFlow.id,
      progressStatus: userFlow.progressStatus,
      portfolioLink: userFlow.portfolioLink,
      flowTitle: flow.title,
      flowType: flow.type,
      flowDescription: flow.description,
      evaluationContent: interviewEvaluation.content,
      evaluationStatus: interviewEvaluation.status,
    })
    .from(userFlow)
    .leftJoin(flow, eq(userFlow.fkFlowId, flow.id))
    .leftJoin(
      interviewEvaluation,
      eq(interviewEvaluation.fkUserFlowId, userFlow.id),
    )
    .where(eq(userFlow.id, userFlowId))
    .limit(1);

  if (!record) {
    throw new Error("报名记录不存在");
  }

  const [userMap, schedules, scoreRows] = await Promise.all([
    listPeopleUsersByLinkIds([record.userId], { canViewSensitiveInfo: false }),
    db
      .select({
        startsAt: interviewSchedule.startsAt,
        endsAt: interviewSchedule.endsAt,
        meetingMinuteLink: interviewSchedule.meetingMinuteLink,
        status: interviewSchedule.status,
      })
      .from(interviewSchedule)
      .where(
        and(
          eq(interviewSchedule.fkUserFlowId, userFlowId),
          eq(interviewSchedule.status, "created"),
        ),
      )
      .orderBy(desc(interviewSchedule.startsAt))
      .limit(1),
    db
      .select({
        points: userPoint.points,
        problemTitle: problem.title,
        problemScore: problem.score,
      })
      .from(userPoint)
      .leftJoin(problem, eq(userPoint.fkProblemId, problem.id))
      .where(eq(userPoint.fkUserFlowId, userFlowId)),
  ]);

  const user = userMap.get(record.userId);
  const totalPoints = scoreRows.reduce((sum, row) => sum + row.points, 0);
  const totalScore = scoreRows.reduce(
    (sum, row) => sum + (row.problemScore ?? 0),
    0,
  );

  return {
    user: {
      college: user?.college ?? null,
      major: user?.major ?? null,
      departments: compactStringArray(user?.departments ?? []),
      github: truncateText(user?.github, 500),
      blog: truncateText(user?.blog, 500),
      personalStatement: truncateText(user?.personalStatement),
    },
    registration: {
      flowTitle: record.flowTitle,
      flowType: record.flowType,
      flowDescription: truncateText(record.flowDescription, 500),
      progressStatus: record.progressStatus,
      portfolioLink: truncateText(record.portfolioLink, 500),
      evaluationStatus: record.evaluationStatus,
      previousEvaluationContent: truncateText(record.evaluationContent, 700),
    },
    interviewSchedule: schedules[0]
      ? {
          startsAt: formatDate(schedules[0].startsAt),
          endsAt: formatDate(schedules[0].endsAt),
          meetingMinuteLink: truncateText(schedules[0].meetingMinuteLink, 500),
          status: schedules[0].status,
        }
      : null,
    score:
      scoreRows.length > 0
        ? {
            totalPoints,
            totalScore,
            items: scoreRows.map((row) => ({
              title: row.problemTitle,
              points: row.points,
              score: row.problemScore,
            })),
          }
        : null,
  };
}

const candidateSummaryInstructions = [
  "你是 SAST 招新系统中的候选人资料摘要助手。",
  "只根据输入数据总结，不要编造作品内容、面试表现、分数或结论。",
  "不要输出手机号、邮箱、QQ、学号等直接联系方式或身份标识。",
  "用中文输出，控制在 6 条以内。",
  "结构：候选人画像、技术/经历线索、报名流程状态、需要人工确认的问题。",
  "不要替代录取决策，不要给出通过或不通过建议。",
].join("\n");

const evaluationDraftInstructions = [
  "你是 SAST 招新面评草稿助手。",
  "只根据输入数据生成面评草稿，不要编造面试表现、作品细节或外部链接内容。",
  "如果缺少面试表现信息，要明确写出需要讲师补充的观察点。",
  "语气客观、克制、便于管理员复核。",
  "输出中文纯文本，包含：整体印象、能力依据、风险或待确认点、建议后续关注。",
  "不要直接写最终录取结论，不要替代人工审核。",
].join("\n");

export async function generateCandidateSummary(userId: number): Promise<AiActionResult> {
  let session: Awaited<ReturnType<typeof verifyRole>> | null = null;

  try {
    session = await verifyRole(2);
    const [userInfo, flows] = await Promise.all([
      getPeopleUserByLinkId(userId, { canViewSensitiveInfo: false }),
      getUserFlowContextByUserId(userId),
    ]);

    const input = JSON.stringify({
      user: {
        college: userInfo.college,
        major: userInfo.major,
        departments: compactStringArray(userInfo.departments),
        github: truncateText(userInfo.github, 500),
        blog: truncateText(userInfo.blog, 500),
        personalStatement: truncateText(userInfo.personalStatement),
      },
      flows,
    });

    const text = await generateTextWithOpenAI({
      instructions: candidateSummaryInstructions,
      input,
      maxOutputTokens: 650,
    });

    return { success: true, data: { text } };
  } catch (error) {
    logServerError("ai:candidate-summary", error, {
      path: "/dashboard/manage",
      userId: session?.uid ?? null,
      role: session?.role ?? null,
      action: "generate-candidate-summary",
      metadata: { targetUserId: userId },
    });
    return getAiErrorResult(error);
  }
}

export async function generateEvaluationDraft(
  userFlowId: number,
  currentContent?: string,
): Promise<AiActionResult> {
  let session: Awaited<ReturnType<typeof verifyRole>> | null = null;

  try {
    session = await verifyRole(2);
    const context = await getCandidateContextByUserFlowId(userFlowId);
    const input = JSON.stringify({
      ...context,
      currentEvaluationDraft: truncateText(currentContent),
    });

    const text = await generateTextWithOpenAI({
      instructions: evaluationDraftInstructions,
      input,
      maxOutputTokens: 750,
    });

    return { success: true, data: { text } };
  } catch (error) {
    logServerError("ai:evaluation-draft", error, {
      path: "/dashboard/recruitment",
      userId: session?.uid ?? null,
      role: session?.role ?? null,
      action: "generate-evaluation-draft",
      userFlowId,
    });
    return getAiErrorResult(error);
  }
}
