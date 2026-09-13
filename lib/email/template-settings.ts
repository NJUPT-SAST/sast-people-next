import { resultEmailCopy, resultEmailLinks } from "./result-email-config";

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
    bodyTemplate: [
      "恭喜你通过本次 {flowName} 阶段考核。",
      "感谢你在任务推进、技术学习和团队交流中的认真投入。WoC / WoD 是一次阶段性的成长检验，结果代表你完成了当前阶段的目标，不涉及成员身份或职级变化。",
      "希望你把这段经历沉淀为继续前进的底气，在后续学习、项目实践和社团活动中保持好奇，也愿意与身边的伙伴分享经验、彼此支持。后续安排将由各组负责人另行通知。",
    ].join("\n\n"),
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
    bodyTemplate: [
      "感谢你参加本次 {flowName} 阶段考核。我们认真看过大家的任务成果和过程投入，也感受到了你对技术学习的热情与坚持。",
      "综合任务完成情况、项目方向和团队安排，很遗憾你本次未能通过。但这只是一次阶段性的反馈，不是对你能力和潜力的否定，更不会影响你继续参与 SAST 的活动。",
      "后续开放 SoC（Summer of Code）考核时，欢迎你继续关注并再次参加。你也可以继续参与公开课、技术分享和项目交流，把这次积累转化为下一次出发的力量。",
      "如需了解本次考核中可以改进的地方，欢迎联系 {contactEmail} 与我们交流。期待在未来的活动中再次见到你。",
    ].join("\n\n"),
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
    bodyTemplate: [
      "恭喜你通过本次 {flowName} 考核，正式留任为讲师！",
      "这一年在 SAST 的投入与成长，我们都看在眼里。感谢你愿意花时间学习、实践，也愿意和伙伴们一起解决问题。你在过程中积累的经验，将成为下一届同学认识技术、融入团队的重要支持。",
      "留任讲师后，你将参与招新、授课、项目维护和社团协作。我们期待你继续保持真诚与耐心，在分享知识的同时，也和大家一起探索新的方向。近期我们会同步你的权限和后续安排。",
    ].join("\n\n"),
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
    bodyTemplate: [
      "感谢你参与本次 {flowName} 考核。",
      "这一年在 SAST 的投入与成长，我们都看在眼里。受名额、方向匹配和综合安排等因素影响，很遗憾你本次未能留任为讲师。但这不是对你能力和付出的否定，也不代表你不适合继续学习和分享。",
      "虽然本次无法留任，你仍然是我们珍视的同行者，也可以继续参与 SAST 后续的公开课、技术分享、项目交流和开源活动。过去积累的经验、写过的代码和认识的伙伴，都不会因为一次结果失去价值。",
      "如需交流后续学习或发展方向，欢迎联系 {contactEmail}。期待在未来的活动中再次见到你。",
    ].join("\n\n"),
  },
];

export function renderTemplateText(
  template: string,
  variables: Record<string, string>,
) {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => variables[key] ?? "");
}
