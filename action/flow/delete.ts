"use server";

import { verifyRole } from "@/lib/dal";
import { db } from "@/db/drizzle";
import { eq } from "drizzle-orm";
import { flow } from "@/db/schema";
import { revalidatePath } from "next/cache";
import { logServerError } from "@/lib/server-error-log";

export async function deleteFlow(id: number) {
  let session: Awaited<ReturnType<typeof verifyRole>> | null = null;

  try {
    session = await verifyRole(3);

    await db
      .update(flow)
      .set({ isDeleted: true, updatedAt: new Date() })
      .where(eq(flow.id, id));

    revalidatePath("/dashboard/flow");
    revalidatePath("/dashboard/user-flow");
  } catch (error) {
    logServerError("flow:delete", error, {
      path: "/dashboard/flow",
      userId: session?.uid ?? null,
      role: session?.role ?? null,
      action: "delete-flow",
      flowId: id,
    });
    throw error;
  }
}
