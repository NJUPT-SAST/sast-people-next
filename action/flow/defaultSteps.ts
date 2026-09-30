import { flowStep } from "@/db/schema";

type FlowStepInsert = typeof flowStep.$inferInsert;

export const isWrittenRecruitmentFlow = (type: string) => type === "recruitment";

export const isOfficeInterviewFlowType = (type: string) =>
  type === "office_interview";

/**
 * 办公类部门面试招新：每个办公部门一条流程，流程内完成两轮面试，
 * 一面通过后由系统推进到「二轮面试」，二轮通过后进入结果确认。
 */
export const officeInterviewSteps = (
  flowId: number,
): Array<Omit<FlowStepInsert, "id">> => [
  {
    title: "报名",
    description: "填写个人信息，选择第一志愿与第二志愿办公部门及面试时段",
    type: "registering",
    order: 1,
    fkFlowId: flowId,
    createdAt: new Date(),
    updatedAt: new Date(),
    isDeleted: false,
  },
  {
    title: "一面面试",
    description: "部门部长进行一对一面试并打分",
    type: "checking",
    order: 2,
    fkFlowId: flowId,
    createdAt: new Date(),
    updatedAt: new Date(),
    isDeleted: false,
  },
  {
    title: "二轮面试",
    description: "无领导小组面试，多位部长共同打分（一面通过后进入）",
    type: "checking",
    order: 3,
    fkFlowId: flowId,
    createdAt: new Date(),
    updatedAt: new Date(),
    isDeleted: false,
  },
  {
    title: "结果确认",
    description: "确认最终通过名单并发送结果通知",
    type: "finished",
    order: 4,
    fkFlowId: flowId,
    createdAt: new Date(),
    updatedAt: new Date(),
    isDeleted: false,
  },
];

/** 按流程类型选择初始化步骤模板 */
export const stepsForFlowType = (type: string, flowId: number) =>
  isWrittenRecruitmentFlow(type)
    ? writtenRecruitmentSteps(flowId)
    : isOfficeInterviewFlowType(type)
      ? officeInterviewSteps(flowId)
      : evaluationFlowSteps(flowId);

export const writtenRecruitmentSteps = (
  flowId: number,
): Array<Omit<FlowStepInsert, "id">> => [
  {
    title: "报名",
    description: "新同学提交报名信息，报名后直接进入批卷环节",
    type: "registering",
    order: 1,
    fkFlowId: flowId,
    createdAt: new Date(),
    updatedAt: new Date(),
    isDeleted: false,
  },
  {
    title: "批卷",
    description: "讲师为该流程内报名同学批改试卷",
    type: "judging",
    order: 2,
    fkFlowId: flowId,
    createdAt: new Date(),
    updatedAt: new Date(),
    isDeleted: false,
  },
  {
    title: "录取确认",
    description: "按分数线筛选并确认最终通过名单",
    type: "finished",
    order: 3,
    fkFlowId: flowId,
    createdAt: new Date(),
    updatedAt: new Date(),
    isDeleted: false,
  },
];

export const evaluationFlowSteps = (
  flowId: number,
): Array<Omit<FlowStepInsert, "id">> => [
  {
    title: "报名",
    description: "提交报名信息",
    type: "registering",
    order: 1,
    fkFlowId: flowId,
    createdAt: new Date(),
    updatedAt: new Date(),
    isDeleted: false,
  },
  {
    title: "讲师审核",
    description: "讲师进行面评并提交同意或不同意",
    type: "checking",
    order: 2,
    fkFlowId: flowId,
    createdAt: new Date(),
    updatedAt: new Date(),
    isDeleted: false,
  },
  {
    title: "管理员审核",
    description: "管理员审核面评结果并确认最终通过状态",
    type: "finished",
    order: 3,
    fkFlowId: flowId,
    createdAt: new Date(),
    updatedAt: new Date(),
    isDeleted: false,
  },
];
