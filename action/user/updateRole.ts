"use server";

import { verifyRole } from "@/lib/dal";
import { updateLinkUserRole } from "@/lib/link/admin";
import { peopleRoleToLinkRole } from "@/lib/link/role";
import { getLinkAccessTokenFromSession } from "@/lib/link/session";
import { writeOperationAudit } from "@/lib/operation-audit";
import { logServerError } from "@/lib/server-error-log";
import { revalidatePath } from "next/cache";

export const updateUserRole = async (uid: number, role: number) => {
  let session: Awaited<ReturnType<typeof verifyRole>> | null = null;

  try {
    session = await verifyRole(3);

    if (![0, 1, 2].includes(role)) {
      throw new Error("不能设置管理员身份");
    }

    const accessToken = await getLinkAccessTokenFromSession();
    await updateLinkUserRole(accessToken, uid, peopleRoleToLinkRole(role));
    await writeOperationAudit({
      actorId: session.uid,
      action: "user.update_role",
      resourceType: "link_user",
      resourceId: uid,
      metadata: { targetRole: role },
    });

    revalidatePath("/dashboard/manage");
  } catch (error) {
    logServerError("user:updateRole", error, {
      path: "/dashboard/manage",
      userId: session?.uid ?? null,
      role: session?.role ?? null,
      action: "update-user-role",
      targetUserId: uid,
      metadata: { targetRole: role },
    });
    throw error;
  }
};
