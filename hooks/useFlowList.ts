import { db } from "@/db/drizzle";
import { displayFlow } from "@/types/flow";
import { flow, flowStep } from "@/db/schema";
import { listPeopleUsersByLinkIds } from "@/lib/link/user-lookup";
import { MissingLinkAdminAccessTokenError } from "@/lib/link/session";
import { and, desc, eq } from "drizzle-orm";

export const useFlowList = async (): Promise<displayFlow[]> => {
  const flowList = await db
    .select()
    .from(flow)
    .where(eq(flow.isDeleted, false))
    .orderBy(desc(flow.createdAt));
  let ownerMap = new Map<number, { name: string }>();
  try {
    ownerMap = await listPeopleUsersByLinkIds(
      flowList.map((item) => item.ownerId),
    );
  } catch (error) {
    // Flow browsing only needs owner names as display metadata. Regular users do
    // not have an admin Link token, so keep the list available without it.
    if (!(error instanceof MissingLinkAdminAccessTokenError)) throw error;
  }
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
