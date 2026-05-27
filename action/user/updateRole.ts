"use server";

import { db } from "@/db/drizzle";
import { user } from "@/db/schema";
import { verifyRole } from "@/lib/dal";
import { logServerError } from "@/lib/server-error-log";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

export const updateUserRole = async (uid: number, role: number) => {
  let session: Awaited<ReturnType<typeof verifyRole>> | null = null;

  try {
    session = await verifyRole(3);

    if (![0, 1, 2].includes(role)) {
      throw new Error("不能设置管理员身份");
    }

    await db
      .update(user)
      .set({ role, updatedAt: new Date() })
      .where(eq(user.id, uid));

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
