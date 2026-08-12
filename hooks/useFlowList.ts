import { db } from "@/db/drizzle";
import { displayFlow } from "@/types/flow";
import { flow, flowStep } from "@/db/schema";
import { listPeopleUsersByLinkIds } from "@/lib/link/user-lookup";
import { MissingLinkAdminAccessTokenError } from "@/lib/link/session";
import { and, desc, eq, inArray } from "drizzle-orm";

export const useFlowList = async (): Promise<displayFlow[]> => {
  const flowList = await db
    .select()
    .from(flow)
    .where(eq(flow.isDeleted, false))
    .orderBy(desc(flow.createdAt));
  const flowIds = flowList.map((item) => item.id);
  const [ownerMap, steps] = await Promise.all([
    getFlowOwnerMap(flowList.map((item) => item.ownerId)),
    flowIds.length === 0
      ? Promise.resolve([])
      : db
          .select()
          .from(flowStep)
          .where(
            and(
              inArray(flowStep.fkFlowId, flowIds),
              eq(flowStep.isDeleted, false),
            ),
          )
          .orderBy(flowStep.fkFlowId, flowStep.order),
  ]);
  const stepsByFlowId = new Map<number, typeof steps>();
  for (const step of steps) {
    const flowSteps = stepsByFlowId.get(step.fkFlowId) ?? [];
    flowSteps.push(step);
    stepsByFlowId.set(step.fkFlowId, flowSteps);
  }

  return flowList.map((item) => (
    {
      ...item,
      owner: ownerMap.get(item.ownerId)?.name ?? "未知用户",
      steps: stepsByFlowId.get(item.id) ?? [],
    }
  ));
};

const getFlowOwnerMap = async (ownerIds: number[]) => {
  try {
    return await listPeopleUsersByLinkIds(ownerIds);
  } catch (error) {
    // Flow browsing only needs owner names as display metadata. Regular users do
    // not have an admin Link token, so keep the list available without it.
    if (error instanceof MissingLinkAdminAccessTokenError) return new Map();
    throw error;
  }
};
