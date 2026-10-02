"use server";

import { verifyManager } from "@/lib/authz";
import { assertFlowEditableRecord } from "@/lib/flow-access";
import { db } from "@/db/drizzle";
import { eq } from "drizzle-orm";
import { flow } from "@/db/schema";
import { revalidatePath } from "next/cache";
import { logServerError } from "@/lib/server-error-log";
import { writeOperationAudit } from "@/lib/operation-audit";
import type { FlowScopedSession } from "./department-utils";

export async function deleteFlow(id: number) {
  let session: FlowScopedSession | null = null;

  try {
    session = await verifyManager();

    const [flowRow] = await db
      .select({ department: flow.department, type: flow.type })
      .from(flow)
      .where(eq(flow.id, id))
      .limit(1);
    if (!flowRow) throw new Error("流程不存在");
    assertFlowEditableRecord(session.scope, flowRow);

    await db
      .update(flow)
      .set({ isDeleted: true, updatedAt: new Date() })
      .where(eq(flow.id, id));

    await writeOperationAudit({
      actorId: session.uid,
      actorRole: session.realRole,
      action: "flow.delete",
      resourceType: "flow",
      resourceId: id,
      department: flowRow.department,
      metadata: { department: flowRow.department },
    });

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
