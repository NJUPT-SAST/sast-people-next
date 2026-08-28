import { createInsertSchema } from "drizzle-zod";
import { flow, flowGroupOptionsSchema } from "@/db/schema";
import { z } from "zod/v4";

export const fullFlowSchema = createInsertSchema(flow, {
  title: z.string().min(1, "请输入流程名称").trim(),
  description: z.string().min(1, "请输入流程描述").trim(),
  startedAt: z.date({ error: "请选择开始时间" }),
  endedAt: z.date({ error: "请选择结束时间" }),
});

export const addFlowSchema = fullFlowSchema
  .pick({
    title: true,
    description: true,
    type: true,
    startedAt: true,
    endedAt: true,
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
    groupOptions: flowGroupOptionsSchema.optional(),
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
  });
