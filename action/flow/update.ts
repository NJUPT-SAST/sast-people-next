"use server";

import { editFlowSchema } from "@/lib/validation/flow";
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
  let parsedValues: z.infer<typeof editFlowSchema> | null = null;

  try {
    session = await verifyRole(3);
    parsedValues = editFlowSchema.parse(values);

    await db
      .update(flow)
      .set({
        title: parsedValues.title,
        description: parsedValues.description,
        startedAt: parsedValues.startedAt,
        endedAt: parsedValues.endedAt,
        groupOptions:
          parsedValues.groupOptions && parsedValues.groupOptions.length > 0
            ? parsedValues.groupOptions
            : null,
        updatedAt: new Date(),
      })
      .where(eq(flow.id, id));

    await writeOperationAudit({
      actorId: session.uid,
      actorRole: session.role,
      action: "flow.update",
      resourceType: "flow",
      resourceId: id,
      metadata: { title: parsedValues.title },
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
        flowType: parsedValues?.type ?? null,
        title: parsedValues?.title ?? null,
      },
    });
    throw error;
  }
};
