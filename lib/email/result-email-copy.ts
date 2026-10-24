import type { ResultEmailFlowKind } from "./blocks";

/**
 * 结果邮件内置正文的唯一来源。
 *
 * 这些文案历史上分散在两处：招新一族（笔试 / 免试）写死在 `emails/offer.tsx` 的版式分支里，
 * WoC / SoC / 办公类则作为 `body_template` 的内置默认值存在 `template-settings.ts`。
 * 现在两边都从这里取，避免「改了组件里的默认、忘了模板设置里的默认」这种分叉。
 *
 * 变量（{flowName} / {department} / {groupNumber} / {contactEmail} …）在渲染时替换；
 * 段落按换行切分，因此这里保留原文里的空行写法。
 */
export const RESULT_EMAIL_BODY_COPY: Record<
  ResultEmailFlowKind,
  { accepted: string; rejected: string }
> = {
  recruitment: {
    accepted: [
      "恭喜你顺利通过 {flowName}，正式成为南京邮电大学大学生科学技术协会的一员。",
      "我们欣赏你对技术的热情和积极的态度。在这里，希望你能与志同道合的伙伴们一起，将脑海中天马行空的创意变为现实，在项目实战中挑战自我，感受协同攻克难关的纯粹快乐。",
      "未来，让我们在这条路上共同学习、进步，在自己所热爱的世界里闪闪发光。",
    ].join("\n\n"),
    rejected: [
      "感谢你参加 {flowName}，你在整个过程中的出色表现，以及展现出的技术才华和学习热情，给我们留下了深刻的印象。",
      "我们对每一位参与者都进行了慎重和综合的评估。经过艰难的抉择，我们很遗憾地通知你，本次未能通过我们的考核。我们深知这个结果可能会让你感到失望，但这绝非对你个人能力的否定，你的才华依然闪耀。",
      "我们希望这次经历不会影响你对技术的热爱，并诚挚地邀请你继续参加我们接下来的授课活动。此外，我们的“寒假大作战”活动也依然向你开放，这是你再次展示自己能力并加入我们的另一个机会。",
      "希望你能继续保持这份对技术的热忱，不断精进，再接再厉。我们期待在未来的活动中再次看到你的身影！",
    ].join("\n\n"),
  },
  recruitment_exemption: {
    accepted: [
      "恭喜你顺利通过 {flowName}，正式成为南京邮电大学大学生科学技术协会的一员。",
      "我们欣赏你对技术的热情和积极的态度。在这里，希望你能与志同道合的伙伴们一起，将脑海中天马行空的创意变为现实，在项目实战中挑战自我，感受协同攻克难关的纯粹快乐。",
      "未来，让我们在这条路上共同学习、进步，在自己所热爱的世界里闪闪发光。",
    ].join("\n\n"),
    rejected: [
      "感谢你参加 {flowName}，你在整个过程中的出色表现，以及展现出的技术才华和学习热情，给我们留下了深刻的印象。",
      "我们对每一位参与者都进行了慎重和综合的评估。经过艰难的抉择，我们很遗憾地通知你，本次未能通过我们的考核。我们深知这个结果可能会让你感到失望，但这绝非对你个人能力的否定，你的才华依然闪耀。",
      "我们希望这次经历不会影响你对技术的热爱，并诚挚地邀请你继续参加我们接下来的授课活动。此外，我们的“寒假大作战”活动也依然向你开放，这是你再次展示自己能力并加入我们的另一个机会。",
      "希望你能继续保持这份对技术的热忱，不断精进，再接再厉。我们期待在未来的活动中再次看到你的身影！",
    ].join("\n\n"),
  },
  woc: {
    accepted: [
      "恭喜你通过本次 {flowName} 阶段考核。",
      "感谢你在任务推进、技术学习和团队交流中的认真投入。WoC / WoD 是一次阶段性的成长检验，结果代表你完成了当前阶段的目标，不涉及成员身份或职级变化。",
      "希望你把这段经历沉淀为继续前进的底气，在后续学习、项目实践和社团活动中保持好奇，也愿意与身边的伙伴分享经验、彼此支持。后续安排将由各组负责人另行通知。",
    ].join("\n\n"),
    rejected: [
      "感谢你参加本次 {flowName} 阶段考核。我们认真看过大家的任务成果和过程投入，也感受到了你对技术学习的热情与坚持。",
      "综合任务完成情况、项目方向和团队安排，很遗憾你本次未能通过。但这只是一次阶段性的反馈，不是对你能力和潜力的否定，更不会影响你继续参与 SAST 的活动。",
      "后续开放 SoC（Summer of Code）考核时，欢迎你继续关注并再次参加。你也可以继续参与公开课、技术分享和项目交流，把这次积累转化为下一次出发的力量。",
      "如需了解本次考核中可以改进的地方，欢迎联系 {contactEmail} 与我们交流。期待在未来的活动中再次见到你。",
    ].join("\n\n"),
  },
  soc: {
    accepted: [
      "恭喜你通过本次 {flowName} 考核，正式留任为讲师！",
      "这一年在 SAST 的投入与成长，我们都看在眼里。感谢你愿意花时间学习、实践，也愿意和伙伴们一起解决问题。你在过程中积累的经验，将成为下一届同学认识技术、融入团队的重要支持。",
      "留任讲师后，你将参与招新、授课、项目维护和社团协作。我们期待你继续保持真诚与耐心，在分享知识的同时，也和大家一起探索新的方向。近期我们会同步你的权限和后续安排。",
    ].join("\n\n"),
    rejected: [
      "感谢你参与本次 {flowName} 考核。",
      "这一年在 SAST 的投入与成长，我们都看在眼里。受名额、方向匹配和综合安排等因素影响，很遗憾你本次未能留任为讲师。但这不是对你能力和付出的否定，也不代表你不适合继续学习和分享。",
      "虽然本次无法留任，你仍然是我们珍视的同行者，也可以继续参与 SAST 后续的公开课、技术分享、项目交流和开源活动。过去积累的经验、写过的代码和认识的伙伴，都不会因为一次结果失去价值。",
      "如需交流后续学习或发展方向，欢迎联系 {contactEmail}。期待在未来的活动中再次见到你。",
    ].join("\n\n"),
  },
  office_round1: {
    accepted: [
      "感谢你对南京邮电大学学生科学技术协会的关注与支持，积极参与本次办公部门招新选拔。经过面试小组综合考察与讨论，现通知你已顺利通过{department}一轮面试。",
      "请及时加入二轮面试qq群{groupNumber}，后续面试考核流程与地点将会在该群通知，并在sast people上及时报名二轮面试。",
    ].join("\n"),
    rejected: [
      "感谢你对南京邮电大学学生科学技术协会的关注与支持，积极参与本次办公部门招新选拔。经过面试小组综合考察与讨论，很遗憾你本次未能通过{department}一轮面试。",
      "感谢你的认真准备与付出，欢迎继续关注并参与校科协的后续活动，期待在未来的活动中再次见到你。",
    ].join("\n"),
  },
  office_round2: {
    accepted: [
      "热烈恭喜！你已经顺利通过校科协{department}全部面试考核，正式成为{department}的一员，欢迎加入校科协大家庭！",
      "请及时加入专属部门qq群{groupNumber}，进群后请将群昵称改为学号姓名😊",
    ].join("\n"),
    rejected: [
      "感谢你对南京邮电大学学生科学技术协会的关注与支持，积极参与本次办公部门招新选拔。经过面试小组综合考察与讨论，很遗憾你本次未能通过{department}二轮面试。",
      "感谢你的认真准备与付出，欢迎继续关注并参与校科协的后续活动，期待在未来的活动中再次见到你。",
    ].join("\n"),
  },
};

/**
 * 结果面板（标签 / 结果标题 / 结果摘要）的内置文案，按模板键给出。
 *
 * 它同时是两处来源：模板设置里的 `result_badge_template` 等字段默认值，
 * 以及正文区块里 `resultPanel` 区块的种子 —— 面板现在是可编辑区块，
 * 这些字段退化成「未自定义版式时的默认文案」。
 */
export const RESULT_EMAIL_PANEL_COPY: Record<
  string,
  {
    resultBadgeTemplate: string;
    resultTitleTemplate: string;
    resultSummaryTemplate: string;
  }
> = {
  "recruitment.result.accepted": {
    resultBadgeTemplate: "通过通知",
    resultTitleTemplate: "恭喜你顺利通过",
    resultSummaryTemplate: "本次笔试考核结果已确认。",
  },
  "recruitment.result.rejected": {
    resultBadgeTemplate: "结果通知",
    resultTitleTemplate: "感谢你的参与",
    resultSummaryTemplate: "本次笔试招新结果已确认。",
  },
  "recruitment_exemption.result.accepted": {
    resultBadgeTemplate: "通过通知",
    resultTitleTemplate: "恭喜你顺利通过",
    resultSummaryTemplate: "本次免试考核结果已确认。",
  },
  "recruitment_exemption.result.rejected": {
    resultBadgeTemplate: "结果通知",
    resultTitleTemplate: "感谢你的参与",
    resultSummaryTemplate: "本次免试招新结果已确认。",
  },
  "woc.result.accepted": {
    resultBadgeTemplate: "通过通知",
    resultTitleTemplate: "恭喜你顺利通过",
    resultSummaryTemplate: "本阶段考核结果已确认。",
  },
  "woc.result.rejected": {
    resultBadgeTemplate: "结果通知",
    resultTitleTemplate: "感谢你的参与",
    resultSummaryTemplate: "本阶段考核结果已确认。",
  },
  "soc.result.accepted": {
    resultBadgeTemplate: "通过通知",
    resultTitleTemplate: "恭喜你顺利通过",
    resultSummaryTemplate: "本次暑期考核结果已确认。",
  },
  "soc.result.rejected": {
    resultBadgeTemplate: "结果通知",
    resultTitleTemplate: "感谢你的参与",
    resultSummaryTemplate: "本次暑期考核结果已确认。",
  },
  "office_round1.result.accepted": {
    resultBadgeTemplate: "通过通知",
    resultTitleTemplate: "恭喜你顺利通过一轮面试",
    resultSummaryTemplate: "本次{department}一轮面试结果已确认",
  },
  "office_round1.result.rejected": {
    resultBadgeTemplate: "结果通知",
    resultTitleTemplate: "感谢你的参与",
    resultSummaryTemplate: "本次{department}一轮面试结果已确认",
  },
  "office_round2.result.accepted": {
    resultBadgeTemplate: "通过通知",
    resultTitleTemplate: "恭喜你顺利通过二轮面试",
    resultSummaryTemplate: "本次{department}二轮面试结果已确认",
  },
  "office_round2.result.rejected": {
    resultBadgeTemplate: "结果通知",
    resultTitleTemplate: "感谢你的参与",
    resultSummaryTemplate: "本次{department}二轮面试结果已确认",
  },
};
