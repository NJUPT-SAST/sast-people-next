"use server";

import { db } from "@/db/drizzle";
import { flow, flowStep } from "@/db/schema";
import { verifyRole } from "@/lib/dal";
import { writeOperationAudit } from "@/lib/operation-audit";
import { logServerError } from "@/lib/server-error-log";
import { fullStepType } from "@/types/step";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { evaluationFlowSteps, isWrittenRecruitmentFlow, writtenRecruitmentSteps } from "../defaultSteps";

type FlowStepInsert = typeof flowStep.$inferInsert;
type FlowStepTypeValue = FlowStepInsert["type"];

export const updateFlowStep = async (
  id: number,
  stepList: fullStepType[]
) => {
  let session: Awaited<ReturnType<typeof verifyRole>> | null = null;

  try {
    session = await verifyRole(3);
    const [flowRecord] = await db
      .select({ type: flow.type })
      .from(flow)
      .where(eq(flow.id, id))
      .limit(1);

    const stepsWithAdminText = (
      fixedSteps: ReturnType<typeof writtenRecruitmentSteps>,
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
      let nextSteps: Array<Omit<FlowStepInsert, "id">>;
      if (flowRecord) {
        nextSteps = isWrittenRecruitmentFlow(flowRecord.type)
          ? stepsWithAdminText(writtenRecruitmentSteps(id))
          : stepsWithAdminText(evaluationFlowSteps(id));
      } else {
        nextSteps = stepList.map((step) => ({
          title: step.title,
          description: step.description,
          type: step.type as FlowStepTypeValue,
          order: step.order,
          fkFlowId: id,
          createdAt: new Date(),
          updatedAt: new Date(),
          isDeleted: false,
        }));
      }

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
      action: "flow.update_steps",
      resourceType: "flow",
      resourceId: id,
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
