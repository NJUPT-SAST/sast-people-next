"use server";

import { db } from "@/db/drizzle";
import { flow, flowStep, normalizeDepartmentKey, problem } from "@/db/schema";
import { verifyManager } from "@/lib/authz";
import { assertFlowEditableRecord } from "@/lib/flow-access";
import { resolveGroupDepartments } from "./department-utils";
import { resolveFlowTypeChange } from "./type-change";
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
  const session = await verifyManager();
  const values = editFlowSchema.parse(input.values);
  if (input.steps.length === 0) throw new Error("流程至少需要一个步骤");

  const [flowRow] = await db
    .select({ department: flow.department, type: flow.type })
    .from(flow)
    .where(eq(flow.id, input.flowId))
    .limit(1);
  if (!flowRow) throw new Error("流程不存在");
  assertFlowEditableRecord(session.scope, flowRow);

  const groupOptions = values.groupOptions?.length ? values.groupOptions : null;
  const patch: Partial<typeof flow.$inferInsert> = {
    title: values.title,
    description: values.description,
    startedAt: values.startedAt,
    endedAt: values.endedAt,
    groupOptions,
    updatedAt: new Date(),
  };

  /* 只有管理员能改归属部门；部长保持原部门不变 */
  const nextDepartment =
    session.scope.kind === "all" && values.department !== undefined
      ? normalizeDepartmentKey(values.department)
      : flowRow.department;
  if (session.scope.kind === "all" && values.department !== undefined) {
    patch.department = nextDepartment;
  }
  /* 类型变更：仅管理员可改、有报名记录则拒绝；办公类必须有归属部门（共享 helper 校验） */
  const typeChange = await resolveFlowTypeChange({
    flowId: input.flowId,
    scope: session.scope,
    currentType: flowRow.type,
    currentDepartment: flowRow.department,
    nextType: values.type,
    nextDepartment,
  });
  if (typeChange) Object.assign(patch, typeChange);
  if (values.groupDepartments !== undefined) {
    patch.groupDepartments = resolveGroupDepartments(
      groupOptions,
      values.groupDepartments,
    );
  }
  if (values.slotOptions !== undefined) {
    patch.slotOptions = values.slotOptions?.length ? values.slotOptions : null;
  }

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
    await tx.update(flow).set(patch).where(eq(flow.id, input.flowId));

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

  await writeOperationAudit({ actorId: session.uid, actorRole: session.realRole, action: "flow.update_workspace", resourceType: "flow", resourceId: input.flowId, department: patch.department !== undefined ? patch.department : flowRow.department, metadata: { stepCount: input.steps.length, problemCount: problemRows.length, department: flowRow.department, previousType: flowRow.type, newType: patch.type ?? flowRow.type } });
  revalidatePath("/dashboard/flow");
  revalidatePath(`/dashboard/flow/edit?id=${input.flowId}`);
}
