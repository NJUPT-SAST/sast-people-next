import { createInsertSchema } from "drizzle-zod";
import {
  departmentKeySchema,
  flow,
  flowGroupDepartmentsSchema,
  flowGroupOptionsSchema,
  flowSlotOptionsSchema,
  type FlowSlotOption,
} from "@/db/schema";
import { z } from "zod/v4";

export const fullFlowSchema = createInsertSchema(flow, {
  title: z.string().min(1, "请输入流程名称").trim(),
  description: z.string().min(1, "请输入流程描述").trim(),
  startedAt: z.date({ error: "请选择开始时间" }),
  endedAt: z.date({ error: "请选择结束时间" }),
});

/* 归属部门：null 表示全局流程，仅管理员可指定；办公类流程的归属部门由服务端解析 */
const flowDepartmentSchema = {
  department: departmentKeySchema.nullable().optional(),
  groupOptions: flowGroupOptionsSchema.optional(),
  groupDepartments: flowGroupDepartmentsSchema.optional(),
};

/* 办公类部门面试招新：每个办公部门一条流程，仅额外支持面试时段 */
const flowOfficeInterviewSchema = {
  slotOptions: flowSlotOptionsSchema.nullable().optional(),
};

type FlowConfigInput = {
  type?: string | null;
  slotOptions?: FlowSlotOption[] | null;
};

const refineFlowConfig = (data: FlowConfigInput, ctx: z.RefinementCtx) => {
  const flowType = data.type ?? "recruitment";
  if (flowType === "office_interview") return;

  if (data.slotOptions && data.slotOptions.length > 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "只有办公类部门面试招新支持面试时段",
      path: ["slotOptions"],
    });
  }
};

export const addFlowSchema = fullFlowSchema
  .pick({
    title: true,
    description: true,
    type: true,
    startedAt: true,
    endedAt: true,
  })
  .extend({ ...flowDepartmentSchema, ...flowOfficeInterviewSchema })
  .superRefine((data, ctx) => {
    if (!data.startedAt) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "请选择开始时间",
        path: ["startedAt"],
      });
    }

    if (
      data.startedAt &&
      data.endedAt &&
      data.endedAt.getTime() < data.startedAt.getTime()
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "结束时间不能早于开始时间",
        path: ["endedAt"],
      });
    }

    refineFlowConfig(data, ctx);
  });

export const editFlowSchema = fullFlowSchema
  .pick({
    id: true,
    title: true,
    description: true,
    type: true,
    startedAt: true,
    endedAt: true,
  })
  .extend({
    endedAt: z.date().nullable().optional(),
    ...flowDepartmentSchema,
    ...flowOfficeInterviewSchema,
  })
  .superRefine((data, ctx) => {
    if (!data.startedAt) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "请选择开始时间",
        path: ["startedAt"],
      });
    }

    if (
      data.startedAt &&
      data.endedAt &&
      data.endedAt.getTime() < data.startedAt.getTime()
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "结束时间不能早于开始时间",
        path: ["endedAt"],
      });
    }

    refineFlowConfig(data, ctx);
  });
