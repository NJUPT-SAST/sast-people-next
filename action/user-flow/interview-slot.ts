"use server";

import { db } from "@/db/drizzle";
import {
  flow,
  flowSlotOptionsSchema,
  interviewSlotChangeRequest,
  userFlow,
} from "@/db/schema";
import { verifyManager } from "@/lib/authz";
import type { FlowScopedSession } from "@/action/flow/department-utils";
import { assertUserFlowInScope } from "@/lib/flow-access";
import { assertFlowResultsEditable } from "@/lib/flow-result-publication-guard";
import { writeOperationAudit } from "@/lib/operation-audit";
import { logServerError } from "@/lib/server-error-log";
import { isOfficeInterviewFlow } from "@/const/flow";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

/**
 * 办公类部门面试：部长在面试管理页直接调整候选人的面试时段。
 * 改时间不再走「候选人申请 → 审批」，候选人私下联系部长，由部长在这里改。
 */

type SlotContext = {
  id: number;
  uid: number;
  flowId: number;
  flowType: string | null;
  slotOptions: unknown;
  department: string | null;
  flowDepartment: string | null;
  interviewSlot: string | null;
};

const loadSlotContext = async (
  userFlowId: number,
): Promise<SlotContext | null> => {
  const [record] = await db
    .select({
      id: userFlow.id,
      uid: userFlow.fkUserId,
      flowId: flow.id,
      flowType: flow.type,
      slotOptions: flow.slotOptions,
      department: userFlow.department,
      flowDepartment: flow.department,
      interviewSlot: userFlow.interviewSlot,
    })
    .from(userFlow)
    .innerJoin(flow, eq(userFlow.fkFlowId, flow.id))
    .where(and(eq(userFlow.id, userFlowId), eq(flow.isDeleted, false)))
    .limit(1);
  return record ?? null;
};

const slotLabelsOf = (value: unknown): string[] => {
  const parsed = flowSlotOptionsSchema.safeParse(value ?? []);
  return parsed.success ? parsed.data.map((option) => option.label) : [];
};

export type UpdateCandidateSlotResult =
  | { success: true; slot: string | null }
  | { success: false; error: { message: string } };

export const updateCandidateInterviewSlot = async (
  userFlowId: number,
  slot: string | null,
): Promise<UpdateCandidateSlotResult> => {
  let session: FlowScopedSession | null = null;
  const normalized = typeof slot === "string" ? slot.trim() : "";

  try {
    session = await verifyManager();
    const actor = session;
    const context = await loadSlotContext(userFlowId);

    if (!context) {
      return { success: false, error: { message: "报名记录不存在" } };
    }
    assertUserFlowInScope(actor.scope, context.department);
    if (!isOfficeInterviewFlow(context.flowType ?? "")) {
      return {
        success: false,
        error: { message: "只有办公类部门面试可以在这里调整时段" },
      };
    }
    await assertFlowResultsEditable(context.flowId);

    const labels = slotLabelsOf(context.slotOptions);
    if (normalized && !labels.includes(normalized)) {
      return {
        success: false,
        error: { message: "该时段不在当前流程的时段选项内，请刷新后重试" },
      };
    }
    const nextSlot = normalized || null;

    await db.transaction(async (tx) => {
      await tx
        .update(userFlow)
        .set({ interviewSlot: nextSlot, updatedAt: new Date() })
        .where(eq(userFlow.id, userFlowId));

      /* 存量办公类改期申请（入口已下线）：直接随改时段关闭，避免一直挂着待审批 */
      await tx
        .update(interviewSlotChangeRequest)
        .set({
          status: "rejected",
          fkReviewedBy: actor.uid,
          reviewNote: "部长在面试管理页直接调整时段（改期审批已下线）",
          reviewedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(interviewSlotChangeRequest.fkUserFlowId, userFlowId),
            eq(interviewSlotChangeRequest.status, "pending"),
          ),
        );
    });

    await writeOperationAudit({
      actorId: actor.uid,
      actorRole: actor.role,
      action: "user_flow.interview_slot.update",
      resourceType: "user_flow",
      resourceId: userFlowId,
      department: context.department ?? context.flowDepartment,
      metadata: {
        previousSlot: context.interviewSlot,
        slot: nextSlot,
        targetUserId: context.uid,
      },
    });

    revalidatePath("/dashboard/interviews");
    return { success: true, slot: nextSlot };
  } catch (error) {
    logServerError("user-flow:updateCandidateInterviewSlot", error, {
      path: "/dashboard/interviews",
      action: "update-candidate-interview-slot",
      userId: session?.uid ?? null,
      role: session?.role ?? null,
      userFlowId,
      metadata: { slot: normalized || null },
    });
    throw error;
  }
};
