"use server";

import { db } from "@/db/drizzle";
import { flow, flowStep, problem } from "@/db/schema";
import { verifyRole } from "@/lib/dal";
import { editFlowSchema } from "@/lib/validation/flow";
import { writeOperationAudit } from "@/lib/operation-audit";
import { fullStepType } from "@/types/step";
import { problemType } from "@/types/problem";
import { and, eq, notInArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod/v4";

type WorkspaceInput = {
  flowId: number;
  values: z.infer<typeof editFlowSchema>;
  steps: fullStepType[];
  problems?: { stepId: number; problems: problemType };
};

export async function saveFlowWorkspace(input: WorkspaceInput) {
  const session = await verifyRole(3);
  const values = editFlowSchema.parse(input.values);
  if (input.steps.length === 0) throw new Error("流程至少需要一个步骤");

  const problemRows = input.problems
    ? Object.values(input.problems.problems).flat().map((item) => ({
        id: item.id,
        title: item.title.trim(),
        score: item.score,
      }))
    : [];
  if (input.problems) {
    if (problemRows.length === 0) throw new Error("至少需要一道题目");
    if (problemRows.some((item) => !item.title || !Number.isInteger(item.score) || item.score <= 0)) {
      throw new Error("题目名称不能为空，分数必须为大于 0 的整数");
    }
  }

  await db.transaction(async (tx) => {
    await tx.update(flow).set({
      title: values.title,
      description: values.description,
      startedAt: values.startedAt,
      endedAt: values.endedAt,
      groupOptions: values.groupOptions?.length ? values.groupOptions : null,
      updatedAt: new Date(),
    }).where(eq(flow.id, input.flowId));

    for (const step of input.steps) {
      await tx.insert(flowStep).values({
        title: step.title.trim() || step.title,
        description: step.description,
        type: step.type,
        order: step.order,
        fkFlowId: input.flowId,
        createdAt: new Date(),
        updatedAt: new Date(),
        isDeleted: false,
      }).onConflictDoUpdate({
        target: [flowStep.fkFlowId, flowStep.order],
        set: { title: step.title.trim() || step.title, description: step.description, type: step.type, updatedAt: new Date(), isDeleted: false },
      });
    }

    if (input.problems) {
      const existing = await tx.select({ id: problem.id }).from(problem).where(eq(problem.fkFlowStepId, input.problems.stepId));
      const existingIds = new Set(existing.map((item) => item.id));
      for (const item of problemRows.filter((row) => row.id > 0 && existingIds.has(row.id))) {
        await tx.update(problem).set({ title: item.title, score: item.score }).where(eq(problem.id, item.id));
      }
      const inserted = problemRows.filter((row) => row.id < 0).length > 0
        ? await tx.insert(problem).values(problemRows.filter((row) => row.id < 0).map((row) => ({ title: row.title, score: row.score, fkFlowStepId: input.problems!.stepId }))).returning({ id: problem.id })
        : [];
      const keepIds = [...problemRows.filter((row) => row.id > 0).map((row) => row.id), ...inserted.map((row) => row.id)];
      if (keepIds.length > 0) {
        await tx.delete(problem).where(and(eq(problem.fkFlowStepId, input.problems.stepId), notInArray(problem.id, keepIds)));
      } else {
        await tx.delete(problem).where(eq(problem.fkFlowStepId, input.problems.stepId));
      }
    }
  });

  await writeOperationAudit({ actorId: session.uid, actorRole: session.role, action: "flow.update_workspace", resourceType: "flow", resourceId: input.flowId, metadata: { stepCount: input.steps.length, problemCount: problemRows.length } });
  revalidatePath("/dashboard/flow");
  revalidatePath(`/dashboard/flow/edit?id=${input.flowId}`);
}
