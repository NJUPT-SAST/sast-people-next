"use server";

import { db } from "@/db/drizzle";
import { flow, userFlow } from "@/db/schema";
import { updateLinkUserRole } from "@/lib/link/admin";
import { peopleRoleToLinkRole } from "@/lib/link/role";
import { getLinkAdminAccessTokenFromSession } from "@/lib/link/session";
import { getPeopleUserByLinkId } from "@/lib/link/user-lookup";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

const ADMIN_ROLE = 3;

const roleGrantedByFlow = (flowType: string) => {
  if (flowType === "soc") return 2;
  if (
    flowType === "recruitment" ||
    flowType === "recruitment_exemption" ||
    flowType === "woc"
  ) {
    return 1;
  }
  return 0;
};

export const syncUserRoleFromAcceptedFlows = async (uid: number) => {
  const userRecord = await getPeopleUserByLinkId(uid);

  // People must never automatically change an administrator role.
  if (!userRecord || userRecord.role === null || userRecord.role >= ADMIN_ROLE) {
    return;
  }

  const acceptedFlows = await db
    .select({ type: flow.type })
    .from(userFlow)
    .innerJoin(flow, eq(userFlow.fkFlowId, flow.id))
    .where(
      and(
        eq(userFlow.fkUserId, uid),
        eq(userFlow.progressStatus, "passed"),
        eq(flow.isDeleted, false),
      ),
    );

  const calculatedRole = acceptedFlows.reduce(
    (role, item) => Math.max(role, roleGrantedByFlow(item.type)),
    0,
  );

  if (calculatedRole !== userRecord.role) {
    const accessToken = await getLinkAdminAccessTokenFromSession();
    await updateLinkUserRole(
      accessToken,
      uid,
      peopleRoleToLinkRole(calculatedRole),
    );
    revalidatePath("/dashboard");
    revalidatePath("/dashboard/manage");
  }
};
