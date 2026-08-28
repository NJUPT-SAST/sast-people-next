"use server";

import { db } from "@/db/drizzle";
import { flow, userFlow } from "@/db/schema";
import { verifyRole, verifySession } from "@/lib/dal";
import { logServerError } from "@/lib/server-error-log";
import { writeOperationAudit } from "@/lib/operation-audit";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

const editableStatuses = new Set(["not_started", "ongoing"]);

type GroupContext = {
  id: number;
  uid: number;
  flowType: string | null;
  flowGroupOptions: unknown;
  progressStatus: string | null;
};

async function loadGroupContext(
  userFlowId: number,
): Promise<GroupContext | null> {
  const [record] = await db
    .select({
      id: userFlow.id,
      uid: userFlow.fkUserId,
      flowType: flow.type,
      flowGroupOptions: flow.groupOptions,
      progressStatus: userFlow.progressStatus,
    })
    .from(userFlow)
    .innerJoin(flow, eq(userFlow.fkFlowId, flow.id))
    .where(and(eq(userFlow.id, userFlowId), eq(flow.isDeleted, false)))
    .limit(1);
  return record ?? null;
}

function normalizeGroupOptions(value: unknown): string[] {
  return (Array.isArray(value) ? value : [])
    .map((option) => (typeof option === "string" ? option.trim() : ""))
    .filter(Boolean);
}

function validateGroupContext(
  context: GroupContext,
): { ok: true; options: string[] } | { ok: false; message: string } {
  if (context.flowType === "recruitment") {
    return { ok: false, message: "当前流程不需要投递组别" };
  }
  const options = normalizeGroupOptions(context.flowGroupOptions);
  if (options.length === 0) {
    return {
      ok: false,
      message: "该流程未配置投递组别选项，请联系管理员在流程管理中配置",
    };
  }
  return { ok: true, options };
}

function validateApplyGroup(
  options: string[],
  applyGroup: string,
): string | null {
  if (!applyGroup.trim()) {
    return "请选择投递组别";
  }
  if (!options.includes(applyGroup.trim())) {
    return "投递组别不在该流程的选项内";
  }
  return null;
}

/** 候选人修改自己的投递组别 */
export const updateApplyGroup = async (
  userFlowId: number,
  applyGroup: string,
) => {
  let session: Awaited<ReturnType<typeof verifySession>> | null = null;

  try {
    session = await verifySession();
    const context = await loadGroupContext(userFlowId);

    if (!context) {
      return { success: false, error: { message: "报名记录不存在" } };
    }
    if (context.uid !== session.uid) {
      return { success: false, error: { message: "只能修改自己的投递组别" } };
    }
    if (!context.progressStatus || !editableStatuses.has(context.progressStatus)) {
      return {
        success: false,
        error: { message: "流程已结束，投递组别不可修改" },
      };
    }

    const validation = validateGroupContext(context);
    if (!validation.ok) {
      return { success: false, error: { message: validation.message } };
    }

    const error = validateApplyGroup(validation.options, applyGroup);
    if (error) {
      return { success: false, error: { message: error } };
    }

    await db
      .update(userFlow)
      .set({ applyGroup: applyGroup.trim(), updatedAt: new Date() })
      .where(eq(userFlow.id, userFlowId));

    await writeOperationAudit({
      actorId: session.uid,
      actorRole: session.role,
      action: "user_flow.apply_group.update",
      resourceType: "user_flow",
      resourceId: userFlowId,
      metadata: { applyGroup: applyGroup.trim(), targetUserId: context.uid },
    });

    revalidatePath("/dashboard/user-flow");
    return { success: true };
  } catch (error) {
    logServerError("user-flow:updateApplyGroup", error, {
      path: "/dashboard/user-flow",
      action: "update-apply-group",
      userId: session?.uid ?? null,
      role: session?.role ?? null,
      userFlowId,
      metadata: { applyGroup: applyGroup.trim() },
    });
    throw error;
  }
};

/** 讲师/管理员在面试管理中标记或修改候选人投递组别 */
export const updateCandidateApplyGroup = async (
  userFlowId: number,
  applyGroup: string,
) => {
  let session: Awaited<ReturnType<typeof verifyRole>> | null = null;

  try {
    session = await verifyRole(2);
    const context = await loadGroupContext(userFlowId);

    if (!context) {
      return { success: false, error: { message: "报名记录不存在" } };
    }

    const validation = validateGroupContext(context);
    if (!validation.ok) {
      return { success: false, error: { message: validation.message } };
    }

    const error = validateApplyGroup(validation.options, applyGroup);
    if (error) {
      return { success: false, error: { message: error } };
    }

    await db
      .update(userFlow)
      .set({ applyGroup: applyGroup.trim(), updatedAt: new Date() })
      .where(eq(userFlow.id, userFlowId));

    await writeOperationAudit({
      actorId: session.uid,
      actorRole: session.role,
      action: "user_flow.apply_group.mark",
      resourceType: "user_flow",
      resourceId: userFlowId,
      metadata: { applyGroup: applyGroup.trim(), targetUserId: context.uid },
    });

    revalidatePath("/dashboard/interviews");
    return { success: true };
  } catch (error) {
    logServerError("user-flow:updateCandidateApplyGroup", error, {
      path: "/dashboard/interviews",
      action: "mark-candidate-apply-group",
      userId: session?.uid ?? null,
      role: session?.role ?? null,
      userFlowId,
      metadata: { applyGroup: applyGroup.trim() },
    });
    throw error;
  }
};
