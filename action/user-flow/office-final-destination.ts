"use server";

import { db } from "@/db/drizzle";
import { flow, normalizeDepartmentKey, userFlow } from "@/db/schema";
import { syncUserIdentityFromAcceptedFlows } from "@/action/user-flow/roleTransition";
import { OFFICE_INTERVIEW_FLOW_TYPE, isOfficeInterviewFlow } from "@/const/flow";
import { verifyManager } from "@/lib/authz";
import { assertFlowEditableRecord } from "@/lib/flow-access";
import { writeOperationAudit } from "@/lib/operation-audit";
import { logServerError } from "@/lib/server-error-log";
import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";

export type OfficeFinalDestinationResult =
  | { success: true; department: string | null }
  | { success: false; error: { message: string } };

/**
 * 部长团评议的“最终去向”：同一候选人通过（或即将通过）多个办公部门时，
 * 由部长/管理员指定最终归属部门（传 null 清除，回到「第一志愿优先」的自动规则）。
 * 决策会写到该候选人全部办公类报名上，并在已发布的情况下立即重新同步身份。
 */
export const setOfficeFinalDestination = async (
  userFlowId: number,
  department: string | null,
): Promise<OfficeFinalDestinationResult> => {
  let session: Awaited<ReturnType<typeof verifyManager>> | null = null;
  try {
    session = await verifyManager();

    const [record] = await db
      .select({
        userFlowId: userFlow.id,
        uid: userFlow.fkUserId,
        flowType: flow.type,
        flowDepartment: flow.department,
      })
      .from(userFlow)
      .innerJoin(flow, eq(userFlow.fkFlowId, flow.id))
      .where(eq(userFlow.id, userFlowId))
      .limit(1);

    if (!record) {
      return { success: false, error: { message: "报名记录不存在" } };
    }
    if (!isOfficeInterviewFlow(record.flowType)) {
      return {
        success: false,
        error: { message: "只有办公类部门面试需要设置最终去向" },
      };
    }
    assertFlowEditableRecord(session.scope, {
      type: record.flowType,
      department: record.flowDepartment,
    });

    const registrations = await db
      .select({
        id: userFlow.id,
        choice: userFlow.choice,
        rowDepartment: userFlow.department,
        flowDepartment: flow.department,
      })
      .from(userFlow)
      .innerJoin(flow, eq(userFlow.fkFlowId, flow.id))
      .where(
        and(
          eq(userFlow.fkUserId, record.uid),
          eq(flow.type, OFFICE_INTERVIEW_FLOW_TYPE),
          eq(flow.isDeleted, false),
        ),
      );

    const target = normalizeDepartmentKey(department);
    if (target) {
      const isChoiceDepartment = registrations.some(
        (item) => (item.flowDepartment ?? item.rowDepartment) === target,
      );
      if (!isChoiceDepartment) {
        return {
          success: false,
          error: { message: "最终去向必须是该候选人报名的志愿部门" },
        };
      }
    }

    await db
      .update(userFlow)
      .set({ finalDepartment: target, updatedAt: new Date() })
      .where(inArray(userFlow.id, registrations.map((item) => item.id)));

    /* 已发布的通过记录：立即按新的最终去向重新同步身份（未发布时由发布流程应用） */
    await syncUserIdentityFromAcceptedFlows([record.uid]);

    await writeOperationAudit({
      actorId: session.uid,
      actorRole: session.realRole,
      action: "user_flow.office_final_destination.set",
      resourceType: "user_flow",
      resourceId: userFlowId,
      department: record.flowDepartment,
      metadata: {
        uid: record.uid,
        finalDepartment: target,
        choices: registrations.map((item) => ({
          userFlowId: item.id,
          choice: item.choice,
          department: item.flowDepartment ?? item.rowDepartment,
        })),
      },
    });

    revalidatePath("/dashboard/interviews");
    return { success: true, department: target };
  } catch (error) {
    logServerError("user-flow:office-final-destination", error, {
      path: "/dashboard/interviews",
      userId: session?.uid ?? null,
      role: session?.role ?? null,
      action: "set-office-final-destination",
      userFlowId,
    });
    throw error;
  }
};
