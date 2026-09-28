import { db } from "@/db/drizzle";
import { flow, flowStep } from "@/db/schema";
import { and, eq } from "drizzle-orm";

const useFlowInfo = async (flowId: number) => {
  const flowInfoList = await db
    .select()
    .from(flow)
    .leftJoin(flowStep, eq(flow.id, flowStep.fkFlowId))
    .where(and(eq(flow.isDeleted, false), eq(flow.id, flowId)))
    .orderBy(flowStep.order);
  const flowInfo = flowInfoList[0]?.flow;
  /* 流程不存在（或已删除）时返回 null，由调用方决定跳转 */
  if (!flowInfo) return null;

  const flowSteps = flowInfoList.map((flow) => {
    return {
      ...flow.flow_step,
    };
  });
  return {
    ...flowInfo,
    steps: flowSteps,
  };
};

export default useFlowInfo;
