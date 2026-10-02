"use server";

import { db } from "@/db/drizzle";
import { flow, flowStep } from "@/db/schema";
import { verifyManager } from "@/lib/authz";
import { assertFlowEditableRecord } from "@/lib/flow-access";
import { writeOperationAudit } from "@/lib/operation-audit";
import { logServerError } from "@/lib/server-error-log";
import { fullStepType } from "@/types/step";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { officeInterviewSteps, stepsForFlowType } from "../defaultSteps";
import type { FlowScopedSession } from "../department-utils";

type FlowStepInsert = typeof flowStep.$inferInsert;

export const updateFlowStep = async (
  id: number,
  stepList: fullStepType[]
) => {
  let session: FlowScopedSession | null = null;

  try {
    session = await verifyManager();
    const [flowRecord] = await db
      .select({ type: flow.type, department: flow.department })
      .from(flow)
      .where(eq(flow.id, id))
      .limit(1);

    if (!flowRecord) throw new Error("流程不存在");
    assertFlowEditableRecord(session.scope, flowRecord);

    const stepsWithAdminText = (
      fixedSteps: ReturnType<typeof officeInterviewSteps>,
    ) => {
      const customStepByOrder = new Map(
        stepList.map((step) => [step.order, step]),
      );

      return fixedSteps.map((step) => {
        const customStep = customStepByOrder.get(step.order);
        return {
          ...step,
          title: customStep?.title?.trim() || step.title,
          description: customStep?.description ?? step.description,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
      });
    };

    await db.transaction(async (tx) => {
      const nextSteps: Array<Omit<FlowStepInsert, "id">> = stepsWithAdminText(
        stepsForFlowType(flowRecord.type, id),
      );

      for (const step of nextSteps) {
        await tx
          .insert(flowStep)
          .values(step)
          .onConflictDoUpdate({
            target: [flowStep.fkFlowId, flowStep.order],
            set: {
              title: step.title,
              description: step.description,
              type: step.type,
              updatedAt: new Date(),
              isDeleted: false,
            },
          });
      }
    });

    revalidatePath("/dashboard/flow");
    await writeOperationAudit({
      actorId: session.uid,
      actorRole: session.realRole,
      action: "flow.update_steps",
      resourceType: "flow",
      resourceId: id,
      department: flowRecord.department,
      metadata: {
        stepCount: stepList.length,
        stepOrders: stepList.map((step) => step.order),
      },
    });
  } catch (error) {
    logServerError("flow-step:update", error, {
      path: "/dashboard/flow",
      userId: session?.uid ?? null,
      role: session?.role ?? null,
      action: "update-flow-steps",
      flowId: id,
      metadata: {
        stepCount: stepList.length,
        stepOrders: stepList.map((step) => step.order),
      },
    });
    throw error;
  }
};
