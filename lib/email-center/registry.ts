import "server-only";

import type {
  EmailTemplateDefinition,
  EmailTemplateKey,
} from "@/lib/email-center/types";

export const emailTemplateDefinitions = [
  {
    key: "recruitment.result.accepted",
    category: "result",
    name: "笔试招新通过结果通知",
    description: "向已通过招新流程的同学发送后续登记、群组和日历信息。",
    defaultSubject: "{flowName} 结果通知",
    variables: [
      { key: "name", label: "候选人姓名", required: true, example: "张三" },
      { key: "flowName", label: "流程名称", required: true, example: "2026 春季招新" },
    ],
  },
  {
    key: "recruitment.result.rejected",
    category: "result",
    name: "笔试招新不通过结果通知",
    description: "向本轮未通过的同学发送结果通知和后续关注信息。",
    defaultSubject: "{flowName} 结果通知",
    variables: [
      { key: "name", label: "候选人姓名", required: true, example: "张三" },
      { key: "flowName", label: "流程名称", required: true, example: "2026 春季招新" },
    ],
  },
  {
    key: "recruitment_exemption.result.accepted",
    category: "result",
    name: "免试招新通过结果通知",
    description: "向已通过免试（面试）招新流程的同学发送后续登记、群组和日历信息。",
    defaultSubject: "{flowName} 结果通知",
    variables: [
      { key: "name", label: "候选人姓名", required: true, example: "张三" },
      { key: "flowName", label: "流程名称", required: true, example: "2026 免试招新" },
    ],
  },
  {
    key: "recruitment_exemption.result.rejected",
    category: "result",
    name: "免试招新不通过结果通知",
    description: "向免试（面试）招新流程中未通过的同学发送结果通知和后续关注信息。",
    defaultSubject: "{flowName} 结果通知",
    variables: [
      { key: "name", label: "候选人姓名", required: true, example: "张三" },
      { key: "flowName", label: "流程名称", required: true, example: "2026 免试招新" },
    ],
  },
  {
    key: "woc.result.accepted",
    category: "result",
    name: "WOC/WOD 通过结果通知",
    description: "通知 WoC/WoD 阶段考核通过结果。",
    defaultSubject: "{flowName} 考核结果通知",
    variables: [
      { key: "name", label: "候选人姓名", required: true, example: "张三" },
      { key: "flowName", label: "流程名称", required: true, example: "2026 WoC" },
    ],
  },
  {
    key: "woc.result.rejected",
    category: "result",
    name: "WOC/WOD 不通过结果通知",
    description: "通知 WoC/WoD 阶段考核结果。",
    defaultSubject: "{flowName} 考核结果通知",
    variables: [
      { key: "name", label: "候选人姓名", required: true, example: "张三" },
      { key: "flowName", label: "流程名称", required: true, example: "2026 WoC" },
    ],
  },
  {
    key: "soc.result.accepted",
    category: "result",
    name: "SOC/SOD 通过结果通知",
    description: "通知通过 SoC/SoD 暑期考核并留任讲师。",
    defaultSubject: "{flowName} 留任结果通知",
    variables: [
      { key: "name", label: "候选人姓名", required: true, example: "张三" },
      { key: "flowName", label: "流程名称", required: true, example: "2026 SoC" },
    ],
  },
  {
    key: "soc.result.rejected",
    category: "result",
    name: "SOC/SOD 不通过结果通知",
    description: "通知 SoC/SoD 暑期考核和留任结果。",
    defaultSubject: "{flowName} 留任结果通知",
    variables: [
      { key: "name", label: "候选人姓名", required: true, example: "张三" },
      { key: "flowName", label: "流程名称", required: true, example: "2026 SoC" },
    ],
  },
  {
    key: "office_round1.result.accepted",
    category: "result",
    name: "部门面试一面通过通知",
    description: "向通过办公类部门一轮面试的同学发送结果通知和二轮面试群信息。",
    defaultSubject: "{name}{department}一轮面试结果通知",
    variables: [
      { key: "name", label: "候选人姓名", required: true, example: "张三" },
      { key: "flowName", label: "流程名称", required: true, example: "2026 办公类部门面试招新" },
      { key: "department", label: "部门", required: true, example: "办公室" },
      { key: "groupNumber", label: "QQ 群号", required: false, example: "123456789" },
    ],
  },
  {
    key: "office_round1.result.rejected",
    category: "result",
    name: "部门面试一面不通过通知",
    description: "向未通过办公类部门一轮面试的同学发送结果通知。",
    defaultSubject: "{name}{department}面试结果通知",
    variables: [
      { key: "name", label: "候选人姓名", required: true, example: "张三" },
      { key: "flowName", label: "流程名称", required: true, example: "2026 办公类部门面试招新" },
      { key: "department", label: "部门", required: true, example: "办公室" },
      { key: "groupNumber", label: "QQ 群号", required: false, example: "123456789" },
    ],
  },
  {
    key: "office_round2.result.accepted",
    category: "result",
    name: "部门面试二面通过通知",
    description: "向通过办公类部门二轮面试的同学发送结果通知和部门群信息。",
    defaultSubject: "{name}{department}二轮面试结果通知",
    variables: [
      { key: "name", label: "候选人姓名", required: true, example: "张三" },
      { key: "flowName", label: "流程名称", required: true, example: "2026 办公类部门面试招新" },
      { key: "department", label: "部门", required: true, example: "办公室" },
      { key: "groupNumber", label: "QQ 群号", required: false, example: "123456789" },
    ],
  },
  {
    key: "office_round2.result.rejected",
    category: "result",
    name: "部门面试二面不通过通知",
    description: "向未通过办公类部门二轮面试的同学发送结果通知。",
    defaultSubject: "{name}{department}面试结果通知",
    variables: [
      { key: "name", label: "候选人姓名", required: true, example: "张三" },
      { key: "flowName", label: "流程名称", required: true, example: "2026 办公类部门面试招新" },
      { key: "department", label: "部门", required: true, example: "办公室" },
      { key: "groupNumber", label: "QQ 群号", required: false, example: "123456789" },
    ],
  },
  {
    key: "interview.schedule.created",
    category: "interview",
    name: "面试预约通知",
    description: "线下面试预约创建后发送给候选人的确认邮件，不包含飞书会议入口。",
    defaultSubject: "{flowName} 面试预约通知",
    variables: [
      { key: "candidateName", label: "候选人姓名", required: true, example: "张三" },
      { key: "flowName", label: "流程名称", required: true, example: "2026 免试招新" },
      { key: "organizerName", label: "讲师姓名", required: true, example: "李四" },
      { key: "startsAt", label: "开始时间", required: true, example: "2026-06-06 16:00" },
      { key: "endsAt", label: "结束时间", required: true, example: "2026-06-06 16:30" },
      { key: "location", label: "地点", required: false, example: "仙林校区大学生活动中心 101" },
    ],
  },
  {
    key: "interview.schedule.rescheduled",
    category: "interview",
    name: "面试改约通知",
    description: "线下面试时间或地点调整后发送给候选人的改约邮件，不包含飞书会议入口。",
    defaultSubject: "{flowName} 面试改约通知",
    variables: [
      { key: "candidateName", label: "候选人姓名", required: true, example: "张三" },
      { key: "flowName", label: "流程名称", required: true, example: "2026 免试招新" },
      { key: "organizerName", label: "讲师姓名", required: true, example: "李四" },
      { key: "startsAt", label: "开始时间", required: true, example: "2026-06-06 16:00" },
      { key: "endsAt", label: "结束时间", required: false, example: "2026-06-06 16:30" },
      { key: "location", label: "地点", required: false, example: "仙林校区大学生活动中心 101" },
    ],
  },
  {
    key: "interview.schedule.cancelled",
    category: "interview",
    name: "面试取消通知",
    description: "面试预约取消后发送给候选人的取消邮件。",
    defaultSubject: "{flowName} 面试取消通知",
    variables: [
      { key: "candidateName", label: "候选人姓名", required: true, example: "张三" },
      { key: "flowName", label: "流程名称", required: true, example: "2026 免试招新" },
      { key: "organizerName", label: "讲师姓名", required: true, example: "李四" },
      { key: "startsAt", label: "开始时间", required: true, example: "2026-06-06 16:00" },
      { key: "endsAt", label: "结束时间", required: true, example: "2026-06-06 16:30" },
      { key: "location", label: "地点", required: false, example: "仙林校区大学生活动中心 101" },
    ],
  },
  {
    key: "interview.application.withdrawn",
    category: "interview",
    name: "面试报名退回通知",
    description: "面试报名被退回后发送给候选人，说明退回理由并提示重新报名。",
    defaultSubject: "{flowName} 面试报名退回通知",
    variables: [
      { key: "candidateName", label: "候选人姓名", required: true, example: "张三" },
      { key: "flowName", label: "流程名称", required: true, example: "2026 免试招新" },
      { key: "reason", label: "退回理由", required: true, example: "请补充作品集后重新报名" },
    ],
  },
  {
    key: "interview.schedule.change.rejected",
    category: "interview",
    name: "面试暂不改期说明",
    description: "候选人申请调整面试时间后发送：说明本次暂不调整的原因，并确认原安排继续有效。",
    defaultSubject: "{flowName} 面试改期说明",
    variables: [
      { key: "candidateName", label: "候选人姓名", required: true, example: "张三" },
      { key: "flowName", label: "流程名称", required: true, example: "2026 免试招新" },
      { key: "reason", label: "说明", required: true, example: "近期讲师时间已排满，请先按原时间参加" },
      {
        key: "requestedTimeText",
        label: "申请改到",
        required: false,
        example: "2026-06-07 16:00",
      },
      { key: "startsAt", label: "原开始时间", required: false, example: "2026-06-06 16:00" },
      { key: "endsAt", label: "原结束时间", required: false, example: "2026-06-06 16:30" },
      { key: "organizerName", label: "讲师姓名", required: false, example: "李四" },
    ],
  },
] satisfies EmailTemplateDefinition[];

export function getEmailTemplateDefinition(templateKey: EmailTemplateKey) {
  return (
    emailTemplateDefinitions.find((definition) => definition.key === templateKey) ??
    null
  );
}
