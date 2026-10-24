/**
 * 面试通知邮件（预约 / 改约 / 取消 / 暂不改期 / 报名退回）的内置版式。
 *
 * 与结果邮件共用同一套区块模型：模板的 `bodyBlocks` 为空时渲染这里的数组，
 * 因此「没自定义过版式」的模板渲染结果 = 改造前写死在组件里的正文。
 * 版式里只放 `{变量}` 占位、不放收件人数据，同一份版式才对所有候选人都成立。
 *
 * 纯数据 + 纯函数，客户端编辑器与服务端渲染共用；不要在这里 import server-only。
 */

import {
  EMPTY_EMAIL_BLOCK_STYLE,
  type EmailBlock,
  type EmailBlockStyle,
  type EmailCardBlock,
  type EmailCardTone,
  type EmailTextBlock,
} from "./blocks";

/** 邮件形态（组件 prop `kind`）→ 模板键：与 lib/email/interview-template-settings.ts 的映射一致 */
export const interviewEmailTemplateKeyByKind = {
  created: "interview.schedule.created",
  rescheduled: "interview.schedule.rescheduled",
  cancelled: "interview.schedule.cancelled",
  change_rejected: "interview.schedule.change.rejected",
  withdrawn: "interview.application.withdrawn",
} as const;

export type InterviewEmailKind = keyof typeof interviewEmailTemplateKeyByKind;
export type InterviewEmailTemplateKey =
  (typeof interviewEmailTemplateKeyByKind)[InterviewEmailKind];

const INTERVIEW_EMAIL_TEMPLATE_KEYS = Object.values(
  interviewEmailTemplateKeyByKind,
) as string[];

/**
 * 内置主题色取中性墨黑：改造前的面试邮件是灰调（状态胶囊 #f1f5f9、日程卡 #f8fafc、
 * 按钮 #0f172a），「不通过橙」会把它变成告警色，所以这里不跟结果邮件共用语义色。
 * `resolveEmailTheme` 由它推导出的徽章 / 卡片底色也落在同一族灰里。
 */
export const DEFAULT_INTERVIEW_EMAIL_THEME_COLOR = "#172033";

/** 状态胶囊文案：模板键决定状态，与组件里原来的 statusLabel 逐字一致 */
const statusLabelByTemplateKey: Record<string, string> = {
  "interview.schedule.created": "已预约",
  "interview.schedule.rescheduled": "已改约",
  "interview.schedule.cancelled": "已取消",
  "interview.schedule.change.rejected": "暂不改期",
  "interview.application.withdrawn": "已退回",
};

/** 开头说明（`bodyText` 为空时使用）：即改造前组件的 defaultBody */
const bodyCopyByTemplateKey: Record<string, string> = {
  "interview.schedule.created":
    "{candidateName} 同学，你好。{flowName} 的线下面试安排已确认，请查看下方时间和地点并按时到达。",
  "interview.schedule.rescheduled":
    "{candidateName} 同学，你好。你的 {flowName} 面试时间已调整，请以本邮件中的新时间为准。",
  "interview.schedule.cancelled":
    "{candidateName} 同学，你好。你的 {flowName} 面试预约已取消，后续安排请关注新的通知。",
  "interview.schedule.change.rejected":
    "{candidateName} 同学，你好。你申请的 {flowName} 面试时间调整，本次暂不调整，面试仍按原安排进行；后续如有变化我们会另行通知。",
  "interview.application.withdrawn":
    "{candidateName} 同学，你好。你的 {flowName} 面试报名已被退回，请根据退回理由补充或调整报名信息后重新报名。",
};

/** 眉标（「面试日程」/「面试报名」）：改造前是标题上方的小号灰字 */
const EYEBROW_STYLE: EmailBlockStyle = {
  ...EMPTY_EMAIL_BLOCK_STYLE,
  margin: "0 0 8px",
  color: "#94a3b8",
  fontSize: "11px",
  fontWeight: "600",
  letterSpacing: "0.12em",
  lineHeight: "16px",
};

/** 页脚上方那行固定说明：改造前在页脚第二行，现在作为正文最后一个区块 */
const FOOTER_NOTE_STYLE: EmailBlockStyle = {
  ...EMPTY_EMAIL_BLOCK_STYLE,
  margin: "0",
  color: "#94a3b8",
  fontSize: "11px",
  lineHeight: "16px",
};

const FOOTER_NOTE = "面试通知 · SAST People 自动发送";

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function textBlock(
  id: string,
  html: string,
  style?: Partial<EmailBlockStyle>,
): EmailTextBlock {
  return {
    id,
    type: "text",
    enabled: true,
    style: { ...EMPTY_EMAIL_BLOCK_STYLE, ...style },
    html,
  };
}

/** 卡片行只放富文本：一行一个「标签　{变量}」，行里变量全为空时渲染器会整行丢掉 */
function cardBlock(
  id: string,
  title: string,
  rows: string[],
  tone: EmailCardTone = "neutral",
): EmailCardBlock {
  return {
    id,
    type: "card",
    enabled: true,
    style: { ...EMPTY_EMAIL_BLOCK_STYLE },
    tone,
    title,
    rows: rows.map((html, index) => ({
      id: `${id}r${index + 1}`,
      kind: "text" as const,
      html,
    })),
  };
}

/**
 * 内置版式（= `bodyBlocks` 为空时的渲染结果）：状态徽章 + 眉标 + 开头说明 +
 * 日程卡（或退回理由 / 说明卡）+ 元信息卡 + 固定页脚说明。
 *
 * 元信息卡里「讲师 / 地点 / 备注 / 申请改到」这几行改造前是按数据有无条件渲染的，
 * 这里靠 `dropEmptyInterviewBlockRows` 保持同样的输出。
 */
export function defaultInterviewEmailBlocks(input: {
  templateKey: string;
  /** 模板自己的正文：非空时替换内置的开头说明（已渲染过变量的最终文案） */
  bodyText?: string | null;
}): EmailBlock[] {
  const templateKey = INTERVIEW_EMAIL_TEMPLATE_KEYS.includes(input.templateKey)
    ? input.templateKey
    : interviewEmailTemplateKeyByKind.created;
  const isWithdrawn = templateKey === interviewEmailTemplateKeyByKind.withdrawn;
  const isChangeRejected =
    templateKey === interviewEmailTemplateKeyByKind.change_rejected;
  const bodyText = input.bodyText?.trim();

  const blocks: EmailBlock[] = [
    {
      id: "b1",
      type: "badge",
      enabled: true,
      style: { ...EMPTY_EMAIL_BLOCK_STYLE },
      text: statusLabelByTemplateKey[templateKey],
    },
    textBlock("b2", isWithdrawn ? "面试报名" : "面试日程", EYEBROW_STYLE),
    textBlock(
      "b3",
      bodyText ? escapeHtml(bodyText) : bodyCopyByTemplateKey[templateKey],
    ),
    /* 退回与暂不改期没有日程可展示，卡片装的是理由 / 说明 */
    cardBlock(
      "b4",
      isWithdrawn ? "退回理由" : isChangeRejected ? "说明" : "{timeLabel}",
      isWithdrawn || isChangeRejected ? ["{reason}"] : ["{startsAt}", "至 {endsAt}"],
    ),
  ];

  if (isWithdrawn) {
    blocks.push({
      id: "b5",
      type: "button",
      enabled: true,
      style: { ...EMPTY_EMAIL_BLOCK_STYLE },
      label: "查看我的流程",
      url: "{flowUrl}",
      variant: "dark",
      align: "left",
    });
  }

  blocks.push(
    cardBlock("b6", "", [
      "流程　{flowName}",
      "{organizerLabel}　{organizerName}",
      ...(isChangeRejected ? ["申请改到　{requestedTimeText}"] : []),
      "地点　{location}",
      "备注　{note}",
    ]),
    textBlock("b7", FOOTER_NOTE, FOOTER_NOTE_STYLE),
  );

  return blocks;
}

const PLACEHOLDER_PATTERN = /\{(\w+)\}/g;

/**
 * 卡片行里的变量全都没有值 → 整行不渲染。
 *
 * 改造前「讲师 / 地点 / 备注 / 申请改到 / 至 …」这些行是按数据有无条件渲染的，
 * 静态版式要靠这条规则保持同样的输出（不然没填备注也会留下一个空标签）。
 * 行里一个变量都没有时不做判断，照常渲染。
 */
export function dropEmptyInterviewBlockRows(
  blocks: EmailBlock[],
  variables: Record<string, string>,
): EmailBlock[] {
  return blocks.map((block) => {
    if (block.type !== "card") return block;
    const rows = block.rows.filter((row) => {
      if (row.kind !== "text") return true;
      const keys = [...row.html.matchAll(PLACEHOLDER_PATTERN)].map((match) => match[1]);
      if (keys.length === 0) return true;
      return keys.some((key) => (variables[key] ?? "").trim().length > 0);
    });
    return rows.length === block.rows.length ? block : { ...block, rows };
  });
}
