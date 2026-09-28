"use server";

import { db } from "@/db/drizzle";
import { flow, flowStep, problem } from "@/db/schema";
import { verifyManager } from "@/lib/authz";
import { assertFlowEditable } from "@/lib/flow-access";
import { writeOperationAudit } from "@/lib/operation-audit";
import { logServerError } from "@/lib/server-error-log";
import { asc, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { createCopiedFlowTitle } from "./duplicate-utils";
import type { FlowScopedSession } from "./department-utils";

export async function duplicateFlow(sourceFlowId: number) {
  let session: FlowScopedSession | null = null;

  try {
    session = await verifyManager();

    let copiedFlowId: number | null = null;
    /* 复制继承源流程归属，审计沿用同一部门 */
    let sourceDepartment: string | null = null;

    await db.transaction(async (tx) => {
      const [sourceFlow] = await tx
        .select()
        .from(flow)
        .where(eq(flow.id, sourceFlowId))
        .limit(1);

      if (!sourceFlow || sourceFlow.isDeleted) {
        throw new Error("Flow not found");
      }

      assertFlowEditable(session!.scope, sourceFlow.department);
      sourceDepartment = sourceFlow.department;

      const [newFlow] = await tx
        .insert(flow)
        .values({
          title: createCopiedFlowTitle(sourceFlow.title),
          description: sourceFlow.description,
          type: sourceFlow.type,
          ownerId: session!.uid,
          startedAt: sourceFlow.startedAt,
          endedAt: sourceFlow.endedAt,
          /* 复制继承源流程的归属部门与组别映射 */
          department: sourceFlow.department,
          groupOptions: sourceFlow.groupOptions,
          groupDepartments: sourceFlow.groupDepartments,
        })
        .returning({ id: flow.id });
      copiedFlowId = newFlow.id;

      const sourceSteps = await tx
        .select()
        .from(flowStep)
        .where(eq(flowStep.fkFlowId, sourceFlowId))
        .orderBy(asc(flowStep.order));

      if (sourceSteps.length === 0) {
        return;
      }

      const copiedSteps = await tx
        .insert(flowStep)
        .values(
          sourceSteps.map((step) => ({
            title: step.title,
            description: step.description,
            type: step.type,
            order: step.order,
            fkFlowId: newFlow.id,
            isDeleted: step.isDeleted,
          })),
        )
        .returning({
          id: flowStep.id,
          order: flowStep.order,
          type: flowStep.type,
        });

      const stepIdMap = new Map(
        sourceSteps.map((sourceStep) => {
          const copiedStep = copiedSteps.find(
            (item) =>
              item.order === sourceStep.order && item.type === sourceStep.type,
          );
          return [sourceStep.id, copiedStep?.id] as const;
        }),
      );

      const sourceProblems = await tx
        .select()
        .from(problem)
        .where(inArray(problem.fkFlowStepId, sourceSteps.map((step) => step.id)));

      const copiedProblems = sourceProblems
        .map((item) => {
          const copiedStepId = stepIdMap.get(item.fkFlowStepId);
          if (!copiedStepId) return null;
          return {
            title: item.title,
            score: item.score,
            fkFlowStepId: copiedStepId,
          };
        })
        .filter((item): item is NonNullable<typeof item> => item !== null);

      if (copiedProblems.length > 0) {
        await tx.insert(problem).values(copiedProblems);
      }
    });

    if (copiedFlowId !== null) {
      await writeOperationAudit({
        actorId: session.uid,
        actorRole: session.role,
        action: "flow.duplicate",
        resourceType: "flow",
        resourceId: copiedFlowId,
        department: sourceDepartment,
        metadata: { sourceFlowId, department: sourceDepartment },
      });
    }

    revalidatePath("/dashboard/flow");
  } catch (error) {
    logServerError("flow:duplicate", error, {
      path: "/dashboard/flow",
      userId: session?.uid ?? null,
      role: session?.role ?? null,
      action: "duplicate-flow",
      flowId: sourceFlowId,
    });
    throw error;
  }
}
