import { resultEmailCopy, resultEmailLinks } from "./result-email-config";
import type { EmailBlock, EmailFrameStyle } from "./blocks";
import { RESULT_EMAIL_BODY_COPY, RESULT_EMAIL_PANEL_COPY } from "./result-email-copy";

export type ResultEmailTemplateSetting = {
  templateKey: string;
  updatedAt?: Date;
  subjectTemplate: string;
  titleTemplate: string;
  subtitleTemplate: string;
  resultBadgeTemplate: string;
  resultTitleTemplate: string;
  resultSummaryTemplate: string;
  bodyTemplate: string;
  memberInfoFormUrl: string;
  feishuGroupUrl: string;
  calendarUrl: string;
  feishuRegisterHelpUrl: string;
  contactEmail: string;
  memberFormLabel: string;
  feishuGroupName: string;
  /** 后续 QQ 群号：办公类部门面试通知的 {groupNumber} 变量 */
  groupNumber: string;
  /** 正文区块：null = 未自定义，渲染时回落到内置版式（lib/email/blocks.ts） */
  bodyBlocks: EmailBlock[] | null;
  /** 邮件外框（背景、内容卡、logo、页眉、页脚）：null = 内置外观 */
  bodyFrame: EmailFrameStyle | null;
  /** 主题色（#RRGGBB）：空字符串 = 沿用内置的通过绿 / 不通过橙 */
  themeColor: string;
};

const baseSetting = {
  titleTemplate: "",
  subtitleTemplate: "",
  resultBadgeTemplate: "",
  resultTitleTemplate: "",
  resultSummaryTemplate: "",
  bodyTemplate: "",
  memberInfoFormUrl: resultEmailLinks.memberInfoForm,
  feishuGroupUrl: resultEmailLinks.feishuGroup,
  calendarUrl: resultEmailLinks.calendar,
  feishuRegisterHelpUrl: resultEmailLinks.feishuRegisterHelp,
  contactEmail: resultEmailCopy.contactEmail,
  memberFormLabel: resultEmailCopy.memberFormLabel,
  feishuGroupName: resultEmailCopy.feishuGroupName,
  groupNumber: "",
  bodyBlocks: null,
  bodyFrame: null,
  themeColor: "",
} satisfies Omit<ResultEmailTemplateSetting, "templateKey" | "subjectTemplate">;

/** 标签 / 结果标题 / 结果摘要来自 `RESULT_EMAIL_PANEL_COPY`，与区块种子同源 */
export const defaultResultEmailTemplateSettings: ResultEmailTemplateSetting[] = [
  {
    templateKey: "recruitment.result.accepted",
    subjectTemplate: "{flowName} 结果通知",
    ...baseSetting,
    titleTemplate: "SAST 笔试招新结果通知",
    subtitleTemplate: "欢迎加入南京邮电大学大学生科学技术协会",
    ...RESULT_EMAIL_PANEL_COPY["recruitment.result.accepted"],
  },
  {
    templateKey: "recruitment.result.rejected",
    subjectTemplate: "{flowName} 结果通知",
    ...baseSetting,
    titleTemplate: "SAST 笔试招新结果通知",
    subtitleTemplate: "感谢你认真完成这次招新流程",
    ...RESULT_EMAIL_PANEL_COPY["recruitment.result.rejected"],
  },
  {
    templateKey: "recruitment_exemption.result.accepted",
    subjectTemplate: "{flowName} 结果通知",
    ...baseSetting,
    titleTemplate: "SAST 免试招新结果通知",
    subtitleTemplate: "欢迎加入南京邮电大学大学生科学技术协会",
    ...RESULT_EMAIL_PANEL_COPY["recruitment_exemption.result.accepted"],
  },
  {
    templateKey: "recruitment_exemption.result.rejected",
    subjectTemplate: "{flowName} 结果通知",
    ...baseSetting,
    titleTemplate: "SAST 免试招新结果通知",
    subtitleTemplate: "感谢你认真完成这次免试招新流程",
    ...RESULT_EMAIL_PANEL_COPY["recruitment_exemption.result.rejected"],
  },
  {
    templateKey: "woc.result.accepted",
    subjectTemplate: "{flowName} 考核结果通知",
    ...baseSetting,
    titleTemplate: "WoC / WoD 考核结果通知",
    subtitleTemplate: "恭喜完成 WoC / WoD 阶段考核",
    ...RESULT_EMAIL_PANEL_COPY["woc.result.accepted"],
    bodyTemplate: RESULT_EMAIL_BODY_COPY.woc.accepted,
  },
  {
    templateKey: "woc.result.rejected",
    subjectTemplate: "{flowName} 考核结果通知",
    ...baseSetting,
    titleTemplate: "WoC / WoD 考核结果通知",
    subtitleTemplate: "感谢你完成 WoC / WoD 阶段考核",
    ...RESULT_EMAIL_PANEL_COPY["woc.result.rejected"],
    bodyTemplate: RESULT_EMAIL_BODY_COPY.woc.rejected,
  },
  {
    templateKey: "soc.result.accepted",
    subjectTemplate: "{flowName} 留任结果通知",
    ...baseSetting,
    titleTemplate: "SoC / SoD 留任结果通知",
    subtitleTemplate: "恭喜通过暑期考核并留任讲师",
    ...RESULT_EMAIL_PANEL_COPY["soc.result.accepted"],
    bodyTemplate: RESULT_EMAIL_BODY_COPY.soc.accepted,
  },
  {
    templateKey: "soc.result.rejected",
    subjectTemplate: "{flowName} 留任结果通知",
    ...baseSetting,
    titleTemplate: "SoC / SoD 留任结果通知",
    subtitleTemplate: "感谢你完成 SoC / SoD 暑期考核",
    ...RESULT_EMAIL_PANEL_COPY["soc.result.rejected"],
    bodyTemplate: RESULT_EMAIL_BODY_COPY.soc.rejected,
  },
  {
    templateKey: "office_round1.result.accepted",
    subjectTemplate: "{department}一轮面试结果通知",
    ...baseSetting,
    titleTemplate: "{department}一轮面试结果通知",
    subtitleTemplate: "恭喜通过{department}一轮面试",
    ...RESULT_EMAIL_PANEL_COPY["office_round1.result.accepted"],
    bodyTemplate: RESULT_EMAIL_BODY_COPY.office_round1.accepted,
  },
  {
    templateKey: "office_round1.result.rejected",
    subjectTemplate: "{department}面试结果通知",
    ...baseSetting,
    titleTemplate: "{department}面试结果通知",
    subtitleTemplate: "感谢你参与{department}面试",
    ...RESULT_EMAIL_PANEL_COPY["office_round1.result.rejected"],
    bodyTemplate: RESULT_EMAIL_BODY_COPY.office_round1.rejected,
  },
  {
    templateKey: "office_round2.result.accepted",
    subjectTemplate: "{department}二轮面试结果通知",
    ...baseSetting,
    titleTemplate: "{department}二轮面试结果通知",
    subtitleTemplate: "恭喜通过{department}二轮面试",
    ...RESULT_EMAIL_PANEL_COPY["office_round2.result.accepted"],
    bodyTemplate: RESULT_EMAIL_BODY_COPY.office_round2.accepted,
  },
  {
    templateKey: "office_round2.result.rejected",
    subjectTemplate: "{department}面试结果通知",
    ...baseSetting,
    titleTemplate: "{department}面试结果通知",
    subtitleTemplate: "感谢你参与{department}面试",
    ...RESULT_EMAIL_PANEL_COPY["office_round2.result.rejected"],
    bodyTemplate: RESULT_EMAIL_BODY_COPY.office_round2.rejected,
  },
];

export function renderTemplateText(
  template: string,
  variables: Record<string, string>,
) {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => variables[key] ?? "");
}
