import * as React from "react";

import {
  DEFAULT_EMAIL_FRAME,
  type EmailBlock,
  type EmailFrameStyle,
} from "../lib/email/blocks";
import { EmailBlockList, EmailShell } from "../lib/email/email-shell";
import {
  DEFAULT_INTERVIEW_EMAIL_THEME_COLOR,
  defaultInterviewEmailBlocks,
  dropEmptyInterviewBlockRows,
  interviewEmailTemplateKeyByKind,
} from "../lib/email/interview-email-blocks";
import { resolveEmailTheme } from "../lib/email/theme";

export type InterviewScheduleEmailProps = {
  kind?: "created" | "rescheduled" | "cancelled" | "withdrawn" | "change_rejected";
  candidateName: string;
  flowName: string;
  titleText?: string;
  bodyText?: string;
  organizerName?: string;
  /**
   * What to call the organiser. Interview appointments are always made by a
   * lecturer, but a withdrawal can be issued by an admin, so that email labels
   * the same slot with the actual role.
   */
  organizerLabel?: string;
  startsAtText?: string;
  endsAtText?: string;
  /** 面试时段标签（办公类面试没有精确起止时间） */
  timeLabel?: string;
  /** 改期申请里候选人希望改到的时间/时段 */
  requestedTimeText?: string;
  location?: string;
  note?: string;
  reason?: string;
  flowUrl?: string;
  footerText?: string;
  logoUrl?: string;
  /**
   * 正文区块。为空时按模板键回落到内置版式（状态徽章 + 眉标 + 正文 + 日程卡 +
   * 元信息卡 + 页脚说明），保证没有自定义版式的模板渲染结果与改造前一致。
   */
  blocks?: EmailBlock[];
  /** 邮件外框（背景、内容卡、logo、页眉、页脚）：空字段回落内置外观 */
  frame?: EmailFrameStyle;
  /** 主题色（#RRGGBB）：空值 = 沿用面试邮件的中性灰 */
  themeColor?: string;
};

const statusLabel = {
  created: "已预约",
  rescheduled: "已改约",
  cancelled: "已取消",
  withdrawn: "已退回",
  change_rejected: "暂不改期",
} as const;

/**
 * 面试通知邮件：外壳 + 正文区块，与结果邮件同一套渲染。
 * 外观与文案都来自模板设置，组件只负责把已渲染好的 props 交给区块渲染器。
 */
export const InterviewScheduleEmail = ({
  kind = "created",
  candidateName,
  flowName,
  titleText = "面试预约通知",
  bodyText,
  organizerName,
  organizerLabel = "讲师",
  startsAtText,
  endsAtText,
  timeLabel,
  requestedTimeText,
  location,
  note,
  reason,
  flowUrl,
  footerText = "南京邮电大学大学生科学技术协会",
  logoUrl = "https://storage.sast.fun/sast-logo.png",
  blocks,
  frame,
  themeColor = "",
}: InterviewScheduleEmailProps) => {
  const label = statusLabel[kind];
  /* 版式里的 {变量} 就是组件已经拿到的这些值：区块渲染器只做替换，不再拼字符串 */
  const variables = {
    candidateName,
    flowName,
    organizerLabel: organizerName ? organizerLabel : "",
    organizerName: organizerName ?? "",
    startsAt: startsAtText ?? "",
    endsAt: endsAtText ?? "",
    timeLabel: timeLabel ?? "面试时间",
    requestedTimeText: requestedTimeText ?? "",
    location: location ?? "",
    note: note ?? "",
    reason: reason ?? "",
    flowUrl: flowUrl ?? "",
  };
  const theme = resolveEmailTheme(
    themeColor || DEFAULT_INTERVIEW_EMAIL_THEME_COLOR,
    false,
  );
  const resolvedBlocks = dropEmptyInterviewBlockRows(
    blocks && blocks.length > 0
      ? blocks
      : defaultInterviewEmailBlocks({
          templateKey: interviewEmailTemplateKeyByKind[kind],
          bodyText,
        }),
    variables,
  );
  /* 页脚文案仍是模板的历史字段 footerText：自定义外框没写页脚时不能把它丢掉 */
  const resolvedFrame: EmailFrameStyle = {
    ...DEFAULT_EMAIL_FRAME,
    ...frame,
    logoUrl: frame?.logoUrl?.trim() || logoUrl,
    footerText: frame?.footerText?.trim() || footerText,
  };

  return (
    <EmailShell
      frame={resolvedFrame}
      theme={theme}
      title={titleText}
      /* 面试邮件没有副标题文案：眉标（面试日程 / 面试报名）留在正文区块里，可编辑可删 */
      subtitle=""
      previewText={`${flowName} ${label} ${kind === "withdrawn" ? "" : startsAtText ?? ""}`}
    >
      <EmailBlockList blocks={resolvedBlocks} variables={variables} theme={theme} />
    </EmailShell>
  );
};

InterviewScheduleEmail.PreviewProps = {
  kind: "created",
  candidateName: "张三",
  flowName: "2026 免试招新",
  titleText: "面试预约已确认",
  organizerName: "讲师",
  startsAtText: "2026-06-04 19:00",
  endsAtText: "2026-06-04 19:30",
  location: "仙林校区大学生活动中心 101",
  note: "请提前准备作品介绍。",
  footerText: "南京邮电大学大学生科学技术协会",
  logoUrl: "https://storage.sast.fun/sast-logo.png",
} as InterviewScheduleEmailProps;

export default InterviewScheduleEmail;
