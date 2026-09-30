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

/* 归属部门：null 表示全局流程，仅管理员可指定 */
const flowDepartmentSchema = {
  department: departmentKeySchema.nullable().optional(),
  groupOptions: flowGroupOptionsSchema.optional(),
  groupDepartments: flowGroupDepartmentsSchema.optional(),
};

/* 办公类部门面试招新：一个共享流程内选择第一/第二志愿办公部门，可选时段 */
const flowOfficeInterviewSchema = {
  slotOptions: flowSlotOptionsSchema.nullable().optional(),
};

type OfficeInterviewConfigInput = {
  type?: string | null;
  slotOptions?: FlowSlotOption[] | null;
  groupOptions?: string[] | null;
  groupDepartments?: Record<string, string> | null;
};

const refineOfficeInterviewConfig = (
  data: OfficeInterviewConfigInput,
  ctx: z.RefinementCtx,
) => {
  const flowType = data.type ?? "recruitment";
  if (flowType === "office_interview") {
    const groups = data.groupOptions ?? [];
    if (groups.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "办公类部门面试招新请配置可投递的办公部门",
        path: ["groupOptions"],
      });
    }
    const mapping = data.groupDepartments ?? {};
    const missing = groups.filter((group) => !mapping[group]);
    if (groups.length > 0 && missing.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "请为每个办公部门配置对应的部门标识",
        path: ["groupDepartments"],
      });
    }
    return;
  }

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

    refineOfficeInterviewConfig(data, ctx);
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

    refineOfficeInterviewConfig(data, ctx);
  });
