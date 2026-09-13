import { resultEmailCopy, resultEmailLinks } from "@/lib/email/result-email-config";

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
};

export const defaultResultEmailTemplateSettings: ResultEmailTemplateSetting[] = [
  {
    templateKey: "recruitment.result.accepted",
    subjectTemplate: "{flowName} 结果通知",
    ...baseSetting,
    titleTemplate: "SAST 招新结果通知",
    subtitleTemplate: "欢迎加入南京邮电大学大学生科学技术协会",
    resultBadgeTemplate: "通过通知",
    resultTitleTemplate: "恭喜你顺利通过",
    resultSummaryTemplate: "本次考核结果已确认。",
  },
  {
    templateKey: "recruitment.result.rejected",
    subjectTemplate: "{flowName} 结果通知",
    ...baseSetting,
    titleTemplate: "SAST 招新结果通知",
    subtitleTemplate: "感谢你认真完成这次招新流程",
    resultBadgeTemplate: "结果通知",
    resultTitleTemplate: "感谢你的参与",
    resultSummaryTemplate: "本次招新结果已确认。",
  },
  {
    templateKey: "woc.result.accepted",
    subjectTemplate: "{flowName} 考核结果通知",
    ...baseSetting,
    titleTemplate: "WoC / WoD 考核结果通知",
    subtitleTemplate: "恭喜完成 WoC / WoD 阶段考核",
    resultBadgeTemplate: "通过通知",
    resultTitleTemplate: "恭喜你顺利通过",
    resultSummaryTemplate: "本阶段考核结果已确认。",
    bodyTemplate: "恭喜你完成本次 {flowName} 阶段考核。感谢你在考核中的投入与贡献，后续安排将由各组负责人另行通知。",
  },
  {
    templateKey: "woc.result.rejected",
    subjectTemplate: "{flowName} 考核结果通知",
    ...baseSetting,
    titleTemplate: "WoC / WoD 考核结果通知",
    subtitleTemplate: "感谢你完成 WoC / WoD 阶段考核",
    resultBadgeTemplate: "结果通知",
    resultTitleTemplate: "感谢你的参与",
    resultSummaryTemplate: "本阶段考核结果已确认。",
    bodyTemplate: "感谢你参加本次 {flowName} 阶段考核。本次结果受名额、项目方向和团队匹配等因素影响，很遗憾你未能通过。一次阶段性结果不能定义你的潜力；后续开放 SoC（Summer of Code）考核时，欢迎你继续关注并再次参加。",
  },
  {
    templateKey: "soc.result.accepted",
    subjectTemplate: "{flowName} 留任结果通知",
    ...baseSetting,
    titleTemplate: "SoC / SoD 留任结果通知",
    subtitleTemplate: "恭喜通过暑期考核并留任讲师",
    resultBadgeTemplate: "通过通知",
    resultTitleTemplate: "恭喜你顺利通过",
    resultSummaryTemplate: "本次暑期考核结果已确认。",
    bodyTemplate: "恭喜你通过本次 {flowName} 考核，正式留任为讲师！这一年在 SAST 的投入与成长，我们都看在眼里。留任讲师后，你将参与招新、授课和项目维护等工作，把经验传递给后来的同学。近期我们会同步你的权限和后续安排：",
  },
  {
    templateKey: "soc.result.rejected",
    subjectTemplate: "{flowName} 留任结果通知",
    ...baseSetting,
    titleTemplate: "SoC / SoD 留任结果通知",
    subtitleTemplate: "感谢你完成 SoC / SoD 暑期考核",
    resultBadgeTemplate: "结果通知",
    resultTitleTemplate: "感谢你的参与",
    resultSummaryTemplate: "本次暑期考核结果已确认。",
    bodyTemplate: "感谢你参与本次 {flowName} 考核。这一年在 SAST 的投入与成长，我们都看在眼里。受名额、方向匹配和综合安排等因素影响，很遗憾你本次未能留任为讲师。但这不是对你能力和付出的否定，也不代表你不适合继续学习和分享。虽然无法留任，你仍可参与 SAST 后续的公开课、技术分享、项目交流等公共活动。",
  },
];

export function renderTemplateText(
  template: string,
  variables: Record<string, string>,
) {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => variables[key] ?? "");
}
