import "server-only";

import type {
  EmailTemplateDefinition,
  EmailTemplateKey,
} from "@/lib/email-center/types";

export const emailTemplateDefinitions = [
  {
    key: "recruitment.result.accepted",
    category: "result",
    name: "招新通过结果通知",
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
    name: "招新不通过结果通知",
    description: "向本轮未通过的同学发送结果通知和后续关注信息。",
    defaultSubject: "{flowName} 结果通知",
    variables: [
      { key: "name", label: "候选人姓名", required: true, example: "张三" },
      { key: "flowName", label: "流程名称", required: true, example: "2026 春季招新" },
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
      { key: "endsAt", label: "结束时间", required: true, example: "2026-06-06 16:30" },
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
] satisfies EmailTemplateDefinition[];

export function getEmailTemplateDefinition(templateKey: EmailTemplateKey) {
  return (
    emailTemplateDefinitions.find((definition) => definition.key === templateKey) ??
    null
  );
}
