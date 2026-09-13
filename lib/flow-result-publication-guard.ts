import "server-only";

import { db } from "@/db/drizzle";
import { flowResultPublication } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function assertFlowResultsEditable(flowId: number) {
  const [publication] = await db
    .select({ status: flowResultPublication.status })
    .from(flowResultPublication)
    .where(eq(flowResultPublication.fkFlowId, flowId))
    .limit(1);

  if (publication?.status === "published" || publication?.status === "publishing") {
    throw new Error("该流程结果正在发布或已经发布，名单和结果已锁定");
  }
}

export async function assertFlowResultsPublished(flowId: number) {
  const [publication] = await db
    .select({ status: flowResultPublication.status })
    .from(flowResultPublication)
    .where(eq(flowResultPublication.fkFlowId, flowId))
    .limit(1);

  if (publication?.status !== "published") {
    throw new Error("请先在流程结果页确认并发布结果，再从邮件中心发送通知");
  }
}
