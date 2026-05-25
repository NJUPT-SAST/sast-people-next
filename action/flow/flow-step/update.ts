"use server";

import { db } from "@/db/drizzle";
import { flow, flowStep } from "@/db/schema";
import { verifyRole } from "@/lib/dal";
import { fullStepType } from "@/types/step";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { evaluationFlowSteps, isWrittenRecruitmentFlow, writtenRecruitmentSteps } from "../defaultSteps";

type FlowStepTypeValue = typeof flowStep.$inferInsert.type;

export const updateFlowStep = async (
  id: number,
  stepList: fullStepType[]
) => {
  await verifyRole(3);
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
    await tx.delete(flowStep).where(eq(flowStep.fkFlowId, id));

    if (flowRecord) {
      if (isWrittenRecruitmentFlow(flowRecord.type)) {
        await tx
          .insert(flowStep)
          .values(stepsWithAdminText(writtenRecruitmentSteps(id)));
        return;
      }
      await tx
        .insert(flowStep)
        .values(stepsWithAdminText(evaluationFlowSteps(id)));
      return;
    }

    await tx.insert(flowStep).values(
      stepList.map((step) => ({
        title: step.title,
        description: step.description,
        type: step.type as FlowStepTypeValue,
        order: step.order,
        fkFlowId: id,
        createdAt: new Date(),
        updatedAt: new Date(),
        isDeleted: false,
      }))
    );
  });

  revalidatePath("/dashboard/flow");
};
