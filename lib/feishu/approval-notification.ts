import "server-only";

import { db } from "@/db/drizzle";
import { flow, interviewEvaluation, interviewSchedule, userFlow } from "@/db/schema";
import { getPeopleUrl } from "@/lib/app-url";
import { sendFeishuCardMessage, updateFeishuCardMessage } from "@/lib/feishu/message";
import { desc, eq } from "drizzle-orm";

const DEFAULT_TIMEZONE = "Asia/Shanghai";

const dateTimeFormatter = new Intl.DateTimeFormat("zh-CN", {
  timeZone: DEFAULT_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

export type FeishuApprovalNotificationContext = {
  evaluationId: number;
  messageId?: string | null;
  candidateName: string;
  candidateStudentId?: string | null;
  authorName: string;
  flowTitle: string;
  recommendation: "passed" | "failed" | null;
  content: string;
  portfolioDescription?: string | null;
  portfolioLink?: string | null;
  meetingLink?: string | null;
  minuteLink?: string | null;
  submittedAt: Date;
  updatedAt: Date;
};

function formatDateTime(value: Date) {
  return dateTimeFormatter.format(value).replace(/\//g, "-");
}

function isHttpUrl(value?: string | null) {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function escapeCardMarkdown(value: string) {
  return value.replace(/[\\`*_{}\[\]()<>#+\-.!|]/g, "\\$&");
}

function referenceLinks(context: FeishuApprovalNotificationContext) {
  const links = [
    ["作品", context.portfolioLink],
    ["会议", context.meetingLink],
    ["妙记", context.minuteLink],
  ].flatMap(([label, url]) => (
    typeof url === "string" && isHttpUrl(url)
      ? [`[${label}](${url})`]
      : []
  ));

  return links.length > 0 ? links.join(" · ") : "未提供";
}

export async function loadFeishuApprovalNotificationRecord(evaluationId: number) {
  const [evaluation] = await db
    .select({
      evaluationId: interviewEvaluation.id,
      messageId: interviewEvaluation.feishuApprovalMessageId,
      userFlowId: interviewEvaluation.fkUserFlowId,
      candidateId: userFlow.fkUserId,
      authorId: interviewEvaluation.fkUserId,
      flowTitle: flow.title,
      recommendation: interviewEvaluation.recommendation,
      content: interviewEvaluation.content,
      submittedAt: interviewEvaluation.createdAt,
      updatedAt: interviewEvaluation.updatedAt,
      portfolioDescription: userFlow.portfolioDescription,
      portfolioLink: userFlow.portfolioLink,
      evaluationMeetingLink: interviewEvaluation.meetingLink,
    })
    .from(interviewEvaluation)
    .innerJoin(userFlow, eq(userFlow.id, interviewEvaluation.fkUserFlowId))
    .innerJoin(flow, eq(flow.id, userFlow.fkFlowId))
    .where(eq(interviewEvaluation.id, evaluationId))
    .limit(1);

  if (!evaluation) return null;

  const [schedule] = await db
    .select({
      meetingLink: interviewSchedule.meetingLink,
      minuteLink: interviewSchedule.meetingMinuteLink,
    })
    .from(interviewSchedule)
    .where(eq(interviewSchedule.fkEvaluationId, evaluationId))
    .orderBy(desc(interviewSchedule.updatedAt))
    .limit(1);

  return {
    ...evaluation,
    meetingLink: schedule?.meetingLink ?? null,
    minuteLink: schedule?.minuteLink ?? evaluation.evaluationMeetingLink ?? null,
  };
}

export function buildFeishuApprovalCard(context: FeishuApprovalNotificationContext) {
  const updated = context.updatedAt.getTime() > context.submittedAt.getTime();
  const recommendation = context.recommendation === "passed"
    ? "讲师建议：通过"
    : context.recommendation === "failed"
      ? "讲师建议：不通过"
      : "讲师建议：未填写";

  return {
    schema: "2.0",
    config: {
      update_multi: true,
      width_mode: "default",
      summary: { content: "People 面评待终审" },
    },
    header: {
      title: { tag: "plain_text", content: updated ? "面评已更新，待终审" : "面评待终审" },
      subtitle: { tag: "plain_text", content: "People · 等待管理员终审" },
      template: "blue",
      icon: { tag: "standard_icon", token: "approval_colorful" },
      text_tag_list: [
        {
          tag: "text_tag",
          text: { tag: "plain_text", content: "待终审" },
          color: "yellow",
        },
      ],
    },
    body: {
      direction: "vertical",
      padding: "12px 12px 20px 12px",
      vertical_spacing: "12px",
      elements: [
        {
          tag: "div",
          fields: [
            {
              is_short: true,
              text: { tag: "lark_md", content: `**候选人**\n${escapeCardMarkdown(context.candidateName)}` },
            },
            ...(context.candidateStudentId
              ? [{
                  is_short: true,
                  text: { tag: "lark_md", content: `**学号**\n${escapeCardMarkdown(context.candidateStudentId)}` },
                }]
              : []),
            {
              is_short: true,
              text: { tag: "lark_md", content: `**招新流程**\n${escapeCardMarkdown(context.flowTitle)}` },
            },
            {
              is_short: true,
              text: { tag: "lark_md", content: `**面评讲师**\n${escapeCardMarkdown(context.authorName)}` },
            },
            {
              is_short: true,
              text: { tag: "lark_md", content: `**提交时间**\n${formatDateTime(context.submittedAt)}` },
            },
            ...(updated
              ? [{
                  is_short: true,
                  text: { tag: "lark_md", content: `**最后更新**\n${formatDateTime(context.updatedAt)}` },
                }]
              : []),
          ],
        },
        {
          tag: "column_set",
          flex_mode: "none",
          columns: [{
            tag: "column",
            width: "weighted",
            weight: 1,
            background_style: "blue-50",
            padding: "12px",
            vertical_spacing: "4px",
            elements: [
              { tag: "markdown", content: `**<font color='blue'>${recommendation}</font>**` },
            ],
          }],
        },
        { tag: "markdown", content: "**作品简介**" },
        {
          tag: "div",
          text: {
            tag: "plain_text",
            content: context.portfolioDescription?.trim() || "未提供",
          },
        },
        { tag: "markdown", content: "**面评全文**" },
        {
          tag: "div",
          text: {
            tag: "plain_text",
            content: context.content,
          },
        },
        {
          tag: "markdown",
          content: `**相关资料**\n${referenceLinks(context)}`,
          text_size: "notation",
        },
        {
          tag: "button",
          text: { tag: "plain_text", content: "去终审" },
          type: "primary_filled",
          size: "large",
          width: "fill",
          behaviors: [{
            type: "open_url",
            default_url: getPeopleUrl("/dashboard/approvals"),
          }],
        },
      ],
    },
  };
}

export async function sendOrUpdateFeishuApprovalCard({
  chatId,
  context,
}: {
  chatId: string;
  context: FeishuApprovalNotificationContext;
}) {
  const card = buildFeishuApprovalCard(context);
  if (context.messageId) {
    await updateFeishuCardMessage({ messageId: context.messageId, card });
    return { messageId: context.messageId, updated: true };
  }

  const result = await sendFeishuCardMessage({
    receiveId: chatId,
    receiveIdType: "chat_id",
    card,
    uuid: `people-approval-evaluation-${context.evaluationId}`,
  });
  if (!result.messageId) {
    throw new Error("send feishu approval card failed: missing message ID");
  }
  return { messageId: result.messageId, updated: false };
}

export function buildFeishuApprovalReminderCard({
  candidateName,
  flowTitle,
  submittedAt,
}: {
  candidateName: string;
  flowTitle: string;
  submittedAt: Date;
}) {
  return {
    schema: "2.0",
    config: {
      update_multi: true,
      width_mode: "default",
      summary: { content: "People 面评仍待终审" },
    },
    header: {
      title: { tag: "plain_text", content: "面评仍待终审" },
      subtitle: { tag: "plain_text", content: "People · 提交一小时后提醒" },
      template: "orange",
      icon: { tag: "standard_icon", token: "approval_colorful" },
      text_tag_list: [{
        tag: "text_tag",
        text: { tag: "plain_text", content: "待终审" },
        color: "yellow",
      }],
    },
    body: {
      direction: "vertical",
      padding: "12px 12px 20px 12px",
      vertical_spacing: "12px",
      elements: [
        {
          tag: "div",
          fields: [
            {
              is_short: true,
              text: { tag: "lark_md", content: `**候选人**\n${escapeCardMarkdown(candidateName)}` },
            },
            {
              is_short: true,
              text: { tag: "lark_md", content: `**招新流程**\n${escapeCardMarkdown(flowTitle)}` },
            },
            {
              is_short: true,
              text: { tag: "lark_md", content: `**提交时间**\n${formatDateTime(submittedAt)}` },
            },
          ],
        },
        {
          tag: "markdown",
          content: "该面评提交一小时后仍未完成终审，请及时处理。",
        },
        {
          tag: "button",
          text: { tag: "plain_text", content: "去终审" },
          type: "primary_filled",
          size: "large",
          width: "fill",
          behaviors: [{
            type: "open_url",
            default_url: getPeopleUrl("/dashboard/approvals"),
          }],
        },
      ],
    },
  };
}
