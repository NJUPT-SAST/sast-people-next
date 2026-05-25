"use server";

import { db } from "@/db/drizzle";
import { flow, user, userFlow } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

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
  const [userRecord] = await db
    .select({ role: user.role })
    .from(user)
    .where(eq(user.id, uid))
    .limit(1);

  if (!userRecord || userRecord.role === null || userRecord.role >= 3) {
    return;
  }

  const acceptedFlows = await db
    .select({ type: flow.type })
    .from(userFlow)
    .innerJoin(flow, eq(userFlow.fkFlowId, flow.id))
    .where(
      and(
        eq(userFlow.fkUserId, uid),
        eq(userFlow.status, "accepted"),
        eq(flow.isDeleted, false),
      ),
    );

  const calculatedRole = acceptedFlows.reduce(
    (role, item) => Math.max(role, roleGrantedByFlow(item.type)),
    0,
  );

  if (calculatedRole !== userRecord.role) {
    await db
      .update(user)
      .set({ role: calculatedRole, updatedAt: new Date() })
      .where(eq(user.id, uid));
    revalidatePath("/dashboard");
    revalidatePath("/dashboard/manage");
  }
};
