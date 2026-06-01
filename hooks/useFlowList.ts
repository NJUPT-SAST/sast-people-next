import { db } from "@/db/drizzle";
import { displayFlow } from "@/types/flow";
import { flow, flowStep } from "@/db/schema";
import { listPeopleUsersByLinkIds } from "@/lib/link/user-lookup";
import { and, desc, eq } from "drizzle-orm";

export const useFlowList = async (): Promise<displayFlow[]> => {
  const flowList = await db
    .select()
    .from(flow)
    .where(eq(flow.isDeleted, false))
    .orderBy(desc(flow.createdAt));
  const ownerMap = await listPeopleUsersByLinkIds(
    flowList.map((item) => item.ownerId),
  );
  const res = await Promise.all(
    flowList.map(async (flow) => {
      const stepsList = await db
        .select()
        .from(flowStep)
        .where(and(eq(flowStep.fkFlowId, flow.id), eq(flowStep.isDeleted, false)));
      return {
        ...flow,
        owner: ownerMap.get(flow.ownerId)?.name ?? "未知用户",
        steps: stepsList,
      };
    })
  );
  return res;
};
