"use server";

import { db } from "@/db/drizzle";
import {
  flow,
  flowSlotOptionsSchema,
  interviewSlotChangeRequest,
  userFlow,
} from "@/db/schema";
import { departmentScopeFilter, verifyScopedRole } from "@/lib/authz";
import type { FlowScopedSession } from "@/action/flow/department-utils";
import { verifySession } from "@/lib/dal";
import { assertUserFlowAccess, canManageSharedOfficeFlow, isSharedOfficeFlow } from "@/lib/flow-access";
import { departmentCategory } from "@/const/department";
import { isOfficeInterviewFlow, OFFICE_INTERVIEW_FLOW_TYPE } from "@/const/flow";
import { logServerError } from "@/lib/server-error-log";
import { writeOperationAudit } from "@/lib/operation-audit";
import { isLinkAuthorizationError } from "@/lib/link/client";
import { MissingLinkAdminAccessTokenError } from "@/lib/link/session";
import { listPeopleUsersByLinkIds } from "@/lib/link/user-lookup";
import { and, desc, eq, isNull, ne, or } from "drizzle-orm";
import { revalidatePath } from "next/cache";

const editableStatuses = new Set(["not_started", "ongoing"]);

type SessionActor = {
  uid: number;
  role: number;
  department: string | null;
};

type ActionResult =
  | { success: true; appliedSlot?: string }
  | { success: false; error: { message: string } };

const slotLabelsOf = (options: unknown): string[] => {
  const parsed = flowSlotOptionsSchema.safeParse(options ?? []);
  return parsed.success ? parsed.data.map((option) => option.label) : [];
};

/** 候选人名单是展示信息：Link 查询失败不应阻断列表渲染 */
const safeUserMap = async (uids: number[]) => {
  try {
    return await listPeopleUsersByLinkIds(uids);
  } catch (error) {
    if (
      error instanceof MissingLinkAdminAccessTokenError ||
      isLinkAuthorizationError(error)
    ) {
      return new Map();
    }
    throw error;
  }
};

export type SecondChoiceCandidateRow = {
  userFlowId: number;
  flowId: number;
  flowTitle: string;
  round: number | null;
  userId: number;
  candidateName: string | null;
  candidateStudentId: string | null;
  firstChoiceDepartment: string | null;
  progressStatus: string | null;
  interviewSlot: string | null;
  createdAt: Date;
};

/** 办公类部门查看「第二志愿投递本部门」的候选人（只读） */
export const listSecondChoiceCandidates = async (): Promise<
  SecondChoiceCandidateRow[]
> => {
  const session: FlowScopedSession = await verifyScopedRole(2);
  if (departmentCategory(session.department) !== "office") {
    return [];
  }

  const rows = await db
    .select({
      userFlowId: userFlow.id,
      flowId: flow.id,
      flowTitle: flow.title,
      /* 候选人当前所处轮次：1=一面，2=二面 */
      round: userFlow.round,
      userId: userFlow.fkUserId,
      firstChoiceDepartment: userFlow.department,
      progressStatus: userFlow.progressStatus,
      interviewSlot: userFlow.interviewSlot,
      createdAt: userFlow.createdAt,
    })
    .from(userFlow)
    .innerJoin(flow, eq(userFlow.fkFlowId, flow.id))
    .where(
      and(
        /* 只显示第二志愿为本部门的报名；第一志愿可能属于其他办公部门 */
        eq(userFlow.secondChoiceDepartment, session.department as string),
        eq(flow.type, OFFICE_INTERVIEW_FLOW_TYPE),
        eq(flow.isDeleted, false),
        ne(userFlow.progressStatus, "withdrawn"),
      ),
    )
    .orderBy(desc(userFlow.createdAt));

  const userMap = await safeUserMap(rows.map((row) => row.userId));
  return rows.map((row) => ({
    ...row,
    candidateName: userMap.get(row.userId)?.name ?? null,
    candidateStudentId: userMap.get(row.userId)?.studentId ?? null,
  }));
};

export type PendingSlotChangeRow = {
  id: number;
  userFlowId: number;
  flowId: number;
  flowTitle: string;
  department: string | null;
  userId: number;
  candidateName: string | null;
  candidateStudentId: string | null;
  currentSlot: string | null;
  requestedSlot: string;
  reason: string | null;
  createdAt: Date;
};

/** 部长审批用：本部门报名中待处理的改时段申请 */
export const listPendingSlotChangeRequests = async (): Promise<
  PendingSlotChangeRow[]
> => {
  const session = await verifyScopedRole(3);
  /* 本部门报名的申请；办公类共享流程由办公类部门共同审批 */
  const scopeFilter = departmentScopeFilter(userFlow.department, session.scope);
  const sharedOfficeFilter =
    scopeFilter && canManageSharedOfficeFlow(session.scope)
      ? and(eq(flow.type, OFFICE_INTERVIEW_FLOW_TYPE), isNull(flow.department))
      : undefined;
  const rows = await db
    .select({
      id: interviewSlotChangeRequest.id,
      userFlowId: interviewSlotChangeRequest.fkUserFlowId,
      flowId: flow.id,
      flowTitle: flow.title,
      department: userFlow.department,
      userId: userFlow.fkUserId,
      currentSlot: userFlow.interviewSlot,
      requestedSlot: interviewSlotChangeRequest.requestedSlot,
      reason: interviewSlotChangeRequest.reason,
      createdAt: interviewSlotChangeRequest.createdAt,
    })
    .from(interviewSlotChangeRequest)
    .innerJoin(userFlow, eq(interviewSlotChangeRequest.fkUserFlowId, userFlow.id))
    .innerJoin(flow, eq(userFlow.fkFlowId, flow.id))
    .where(
      and(
        eq(interviewSlotChangeRequest.status, "pending"),
        scopeFilter && sharedOfficeFilter
          ? or(scopeFilter, sharedOfficeFilter)
          : scopeFilter,
      ),
    )
    .orderBy(desc(interviewSlotChangeRequest.createdAt));

  const userMap = await safeUserMap(rows.map((row) => row.userId));
  return rows.map((row) => ({
    ...row,
    candidateName: userMap.get(row.userId)?.name ?? null,
    candidateStudentId: userMap.get(row.userId)?.studentId ?? null,
  }));
};

/** 候选人申请修改面试时段；同一报名只保留一条待审批申请 */
export const requestInterviewSlotChange = async (
  userFlowId: number,
  requestedSlot: string,
  reason?: string,
): Promise<ActionResult> => {
  let session: SessionActor | null = null;
  try {
    session = await verifySession();
    const requested = requestedSlot.trim();
    if (!requested) {
      return { success: false, error: { message: "请选择要改到的面试时段" } };
    }

    const [record] = await db
      .select({
        id: userFlow.id,
        uid: userFlow.fkUserId,
        department: userFlow.department,
        progressStatus: userFlow.progressStatus,
        interviewSlot: userFlow.interviewSlot,
        flowType: flow.type,
        slotOptions: flow.slotOptions,
      })
      .from(userFlow)
      .innerJoin(flow, eq(userFlow.fkFlowId, flow.id))
      .where(and(eq(userFlow.id, userFlowId), eq(flow.isDeleted, false)))
      .limit(1);

    if (!record) {
      return { success: false, error: { message: "报名记录不存在" } };
    }
    if (record.uid !== session.uid) {
      return { success: false, error: { message: "只能为自己的报名申请修改时段" } };
    }
    if (!isOfficeInterviewFlow(record.flowType)) {
      return { success: false, error: { message: "该流程不支持修改面试时段" } };
    }
    if (!editableStatuses.has(record.progressStatus ?? "")) {
      return {
        success: false,
        error: { message: "当前面试已结束，无法再修改面试时段" },
      };
    }
    const labels = slotLabelsOf(record.slotOptions);
    if (!labels.includes(requested)) {
      return { success: false, error: { message: "面试时段不在该流程的选项内" } };
    }
    if (requested === record.interviewSlot) {
      return { success: false, error: { message: "该时段与当前时段相同" } };
    }

    await db.transaction(async (tx) => {
      await tx
        .delete(interviewSlotChangeRequest)
        .where(
          and(
            eq(interviewSlotChangeRequest.fkUserFlowId, userFlowId),
            eq(interviewSlotChangeRequest.status, "pending"),
          ),
        );
      await tx.insert(interviewSlotChangeRequest).values({
        fkUserFlowId: userFlowId,
        requestedSlot: requested,
        reason: reason?.trim() || null,
        fkRequestedBy: session!.uid,
      });
    });

    await writeOperationAudit({
      actorId: session.uid,
      actorRole: session.role,
      action: "user_flow.interview_slot.request",
      resourceType: "user_flow",
      resourceId: userFlowId,
      department: record.department,
      metadata: { requestedSlot: requested, fromSlot: record.interviewSlot },
    });
    revalidatePath("/dashboard/user-flow");
    return { success: true };
  } catch (error) {
    logServerError("user-flow:slot-change:request", error, {
      path: "/dashboard/user-flow",
      userId: session?.uid ?? null,
      role: session?.role ?? null,
      action: "request-interview-slot-change",
      userFlowId,
    });
    throw error;
  }
};

/** 部长及以上审批改时段申请；批准时可指定最终时段（默认按申请时段） */
export const reviewInterviewSlotChange = async (
  requestId: number,
  approved: boolean,
  finalSlot?: string,
  reviewNote?: string,
): Promise<ActionResult> => {
  let session: FlowScopedSession | null = null;
  try {
    session = await verifyScopedRole(3);

    const result = await db.transaction(async (tx) => {
      const [record] = await tx
        .select({
          id: interviewSlotChangeRequest.id,
          userFlowId: interviewSlotChangeRequest.fkUserFlowId,
          requestedSlot: interviewSlotChangeRequest.requestedSlot,
          status: interviewSlotChangeRequest.status,
          rowDepartment: userFlow.department,
          currentSlot: userFlow.interviewSlot,
          slotOptions: flow.slotOptions,
          flowType: flow.type,
          flowDepartment: flow.department,
        })
        .from(interviewSlotChangeRequest)
        .innerJoin(
          userFlow,
          eq(interviewSlotChangeRequest.fkUserFlowId, userFlow.id),
        )
        .innerJoin(flow, eq(userFlow.fkFlowId, flow.id))
        .where(eq(interviewSlotChangeRequest.id, requestId))
        .for("update")
        .limit(1);

      if (!record) throw new Error("改时段申请不存在");
      /* 只能审批本部门候选人的申请；办公类共享流程由办公类部门共同审批 */
      assertUserFlowAccess(session!.scope, {
        type: record.flowType,
        department: isSharedOfficeFlow({
          type: record.flowType,
          department: record.flowDepartment,
        })
          ? record.flowDepartment
          : record.rowDepartment,
      });
      if (record.status !== "pending") throw new Error("该申请已处理");

      if (!approved) {
        await tx
          .update(interviewSlotChangeRequest)
          .set({
            status: "rejected",
            fkReviewedBy: session!.uid,
            reviewNote: reviewNote?.trim() || null,
            reviewedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(interviewSlotChangeRequest.id, requestId));
        return { appliedSlot: undefined as string | undefined };
      }

      const appliedSlot = finalSlot?.trim() || record.requestedSlot;
      const labels = slotLabelsOf(record.slotOptions);
      if (!labels.includes(appliedSlot)) {
        throw new Error("面试时段不在该流程的选项内");
      }

      await tx
        .update(userFlow)
        .set({ interviewSlot: appliedSlot, updatedAt: new Date() })
        .where(eq(userFlow.id, record.userFlowId));
      await tx
        .update(interviewSlotChangeRequest)
        .set({
          status: "approved",
          fkReviewedBy: session!.uid,
          reviewNote: reviewNote?.trim() || null,
          reviewedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(interviewSlotChangeRequest.id, requestId));

      return { appliedSlot };
    });

    await writeOperationAudit({
      actorId: session.uid,
      actorRole: session.role,
      action: "user_flow.interview_slot.review",
      resourceType: "interview_slot_change_request",
      resourceId: requestId,
      department: session.department,
      metadata: { approved, appliedSlot: result.appliedSlot },
    });
    revalidatePath("/dashboard/interviews");
    revalidatePath("/dashboard/user-flow");
    return { success: true, appliedSlot: result.appliedSlot };
  } catch (error) {
    logServerError("user-flow:slot-change:review", error, {
      path: "/dashboard/interviews",
      userId: session?.uid ?? null,
      role: session?.role ?? null,
      action: "review-interview-slot-change",
      metadata: { requestId, approved },
    });
    throw error;
  }
};
