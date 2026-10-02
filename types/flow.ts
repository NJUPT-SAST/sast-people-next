import { flow, type FlowSlotOption } from "@/db/schema";
import { InferSelectModel } from "drizzle-orm";

export type insertFlowType = Omit<InferSelectModel<typeof flow>, "id">;

export type displayFlow = InferSelectModel<typeof flow>;

export type flowSelection = Pick<
  InferSelectModel<typeof flow>,
  "id" | "title" | "type" | "groupOptions" | "department"
> & {
  /* 办公类流程的集中面谈时段选项；技术流程/未查询该列时为 undefined */
  slotOptions?: FlowSlotOption[] | null;
};
