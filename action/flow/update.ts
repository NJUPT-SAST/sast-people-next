"use server";

import { editFlowSchema } from "@/lib/validation/flow";
import { db } from "@/db/drizzle";
import { flow, normalizeDepartmentKey } from "@/db/schema";
import { verifyManager } from "@/lib/authz";
import { assertFlowEditableRecord } from "@/lib/flow-access";
import { resolveGroupDepartments, type FlowScopedSession } from "./department-utils";
import { OFFICE_INTERVIEW_FLOW_TYPE } from "@/const/flow";
import { logServerError } from "@/lib/server-error-log";
import { writeOperationAudit } from "@/lib/operation-audit";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod/v4";

export const updateFlow = async (
  id: number,
  values: z.infer<typeof editFlowSchema>
) => {
  let session: FlowScopedSession | null = null;
  let parsedValues: z.infer<typeof editFlowSchema> | null = null;

  try {
    session = await verifyManager();
    parsedValues = editFlowSchema.parse(values);

    const [flowRow] = await db
      .select({ department: flow.department, type: flow.type })
      .from(flow)
      .where(eq(flow.id, id))
      .limit(1);
    if (!flowRow) throw new Error("流程不存在");
    assertFlowEditableRecord(session.scope, flowRow);

    const groupOptions = parsedValues.groupOptions?.length
      ? parsedValues.groupOptions
      : null;
    const patch: Partial<typeof flow.$inferInsert> = {
      title: parsedValues.title,
      description: parsedValues.description,
      startedAt: parsedValues.startedAt,
      endedAt: parsedValues.endedAt,
      groupOptions,
      updatedAt: new Date(),
    };

    /* 只有管理员能改归属部门；部长保持原部门不变 */
    if (session.scope.kind === "all" && parsedValues.department !== undefined) {
      patch.department = normalizeDepartmentKey(parsedValues.department);
    }
    /* 办公类部门面试招新是所有办公部门共用的一条流程，归属部门固定为空 */
    if (flowRow.type === OFFICE_INTERVIEW_FLOW_TYPE) {
      patch.department = null;
    }
    if (parsedValues.groupDepartments !== undefined) {
      patch.groupDepartments = resolveGroupDepartments(
        groupOptions,
        parsedValues.groupDepartments,
      );
    }
    if (parsedValues.slotOptions !== undefined) {
      patch.slotOptions = parsedValues.slotOptions?.length
        ? parsedValues.slotOptions
        : null;
    }

    await db.update(flow).set(patch).where(eq(flow.id, id));

    await writeOperationAudit({
      actorId: session.uid,
      actorRole: session.role,
      action: "flow.update",
      resourceType: "flow",
      resourceId: id,
      department: patch.department !== undefined ? patch.department : flowRow.department,
      metadata: { title: parsedValues.title, department: flowRow.department },
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
