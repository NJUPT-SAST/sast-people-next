"use server";

import { db } from "@/db/drizzle";
import { userFlow } from "@/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { verifySession } from "@/lib/dal";
import { logServerError } from "@/lib/server-error-log";

export const unregister = async (userFlowId: number) => {
  let session: Awaited<ReturnType<typeof verifySession>> | null = null;

  try {
    session = await verifySession();

    const record = await db
      .select({ id: userFlow.id, fkUserId: userFlow.fkUserId })
      .from(userFlow)
      .where(eq(userFlow.id, userFlowId))
      .limit(1);

    if (!record[0] || record[0].fkUserId !== session.uid) {
      return { success: false, error: { message: "无权操作" } };
    }

    await db.delete(userFlow).where(eq(userFlow.id, userFlowId));
    revalidatePath("/user-flow");
    return { success: true };
  } catch (error) {
    logServerError("user-flow:unregister", error, {
      path: "/dashboard/user-flow",
      userId: session?.uid ?? null,
      role: session?.role ?? null,
      action: "unregister-flow",
      userFlowId,
    });
    throw error;
  }
};
