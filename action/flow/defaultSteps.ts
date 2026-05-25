import { flowStep } from "@/db/schema";

type FlowStepInsert = typeof flowStep.$inferInsert;

export const isWrittenRecruitmentFlow = (type: string) => type === "recruitment";

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
