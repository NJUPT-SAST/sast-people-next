"use server";

import { editFlowSchema } from "@/components/flow/add";
import { db } from "@/db/drizzle";
import { flow } from "@/db/schema";
import { verifyRole } from "@/lib/dal";
import { logServerError } from "@/lib/server-error-log";
import { writeOperationAudit } from "@/lib/operation-audit";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod/v4";

export const updateFlow = async (
  id: number,
  values: z.infer<typeof editFlowSchema>
) => {
  let session: Awaited<ReturnType<typeof verifyRole>> | null = null;

  try {
    session = await verifyRole(3);

    await db
      .update(flow)
      .set({
        title: values.title,
        description: values.description,
        startedAt: values.startedAt,
        endedAt: values.endedAt,
        updatedAt: new Date(),
      })
      .where(eq(flow.id, id));

    await writeOperationAudit({
      actorId: session.uid,
      action: "flow.update",
      resourceType: "flow",
      resourceId: id,
      metadata: { title: values.title },
    });

    revalidatePath("/dashboard/flow");
  } catch (error) {
    logServerError("flow:update", error, {
      path: "/dashboard/flow",
      userId: session?.uid ?? null,
      role: session?.role ?? null,
      action: "update-flow",
      flowId: id,
      metadata: {
        flowType: values.type,
        title: values.title,
      },
    });
    throw error;
  }
};
