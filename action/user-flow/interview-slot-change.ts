"use server";

import { db } from "@/db/drizzle";
import {
  flow,
  interviewSchedule,
  interviewSlotChangeRequest,
  userFlow,
} from "@/db/schema";
import { createInterviewSchedule } from "@/action/user-flow/interviewSchedule";
import { LECTURER_ROLE } from "@/lib/link/role";
import { verifyScopedRole } from "@/lib/authz";
import { verifySession } from "@/lib/dal";
import { isTechInterviewFlow } from "@/const/flow";
import { getEducationEmail } from "@/lib/email/address";
import { createRenderedEmailDelivery } from "@/lib/email-center/delivery";
import { getValidFeishuUserCredential } from "@/lib/feishu/oauth-account";
import { sendInterviewSlotChangeRequestCard } from "@/lib/feishu/interview-message";
import { isLinkAuthorizationError } from "@/lib/link/client";
import { MissingLinkAdminAccessTokenError } from "@/lib/link/session";
import { listPeopleUsersByLinkIds } from "@/lib/link/user-lookup";
import { writeOperationAudit } from "@/lib/operation-audit";
import { logServerError } from "@/lib/server-error-log";
import { formatBeijingDateTime, parseBeijingDateTime } from "@/lib/timezone";
import { and, desc, eq, type SQL } from "drizzle-orm";
import { revalidatePath } from "next/cache";

/**
 * 技术部门面试改期申请：
 * 候选人给出希望改到的新时间（时长沿用原日程），由**预约该日程的讲师**处理；
 * 同意后同步飞书日程与留档会议并发改约邮件；暂不改期时需填写说明并邮件告知候选人。
 * 办公类部门面试的时段调整已下线，改由部长在面试管理页直接修改，不在此申请审批。
 * 申请理由与暂不改期的说明均必填。
 */

const editableStatuses = new Set(["not_started", "ongoing"]);

type ActionResult =
  | { success: true }
  | { success: false; error: { message: string } };

export type ReviewSlotChangeResult =
  | { success: true; appliedStartsAt?: Date }
  | { success: false; error: { message: string } };

const formatMinute = (value: Date) =>
  formatBeijingDateTime(value).slice(0, 16);

/** Date → 日程输入格式（北京时间 "YYYY-MM-DDTHH:mm"） */
const toScheduleInput = (value: Date) =>
  formatMinute(value).replace(" ", "T");

const parseRequestedTime = (value: string | undefined) => {
  const normalized = value?.trim().replace(" ", "T");
  if (!normalized) return null;
  return parseBeijingDateTime(normalized);
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

export type PendingSlotChangeRow = {
  id: number;
  userFlowId: number;
  flowId: number;
  flowTitle: string;
  flowType: string;
  department: string | null;
  userId: number;
  candidateName: string | null;
  candidateStudentId: string | null;
  /** 当前面试时间（原飞书日程） */
  currentStartsAt: Date | null;
  currentEndsAt: Date | null;
  /** 申请改到的新时间 */
  requestedStartsAt: Date | null;
  requestedEndsAt: Date | null;
  reason: string;
  scheduleId: number | null;
  organizerId: number | null;
  createdAt: Date;
};

/**
 * 审批用待处理列表：改期申请由预约讲师审批，因此只有预约讲师（含管理员）能看到自己日程的申请。
 * 办公类已不产生改期申请（时段由部长直接修改），因此部长不再有可见性分支。
 * 传入 flowId 时只返回该流程的申请。
 */
export const listPendingSlotChangeRequests = async (
  flowId?: number | null,
): Promise<PendingSlotChangeRow[]> => {
  const session = await verifyScopedRole(LECTURER_ROLE);

  const conditions: SQL[] = [eq(interviewSlotChangeRequest.status, "pending")];
  if (typeof flowId === "number" && Number.isFinite(flowId)) {
    conditions.push(eq(flow.id, flowId));
  }
  /* 改约申请只对「预约该日程的讲师」可见：管理员也只看自己预约的日程 */
  conditions.push(eq(interviewSchedule.fkOrganizerId, session.uid));

  const rows = await db
    .select({
      id: interviewSlotChangeRequest.id,
      userFlowId: interviewSlotChangeRequest.fkUserFlowId,
      flowId: flow.id,
      flowTitle: flow.title,
      flowType: flow.type,
      department: userFlow.department,
      userId: userFlow.fkUserId,
      requestedStartsAt: interviewSlotChangeRequest.requestedStartsAt,
      requestedEndsAt: interviewSlotChangeRequest.requestedEndsAt,
      reason: interviewSlotChangeRequest.reason,
      scheduleId: interviewSlotChangeRequest.fkInterviewScheduleId,
      createdAt: interviewSlotChangeRequest.createdAt,
      scheduleStartsAt: interviewSchedule.startsAt,
      scheduleEndsAt: interviewSchedule.endsAt,
      organizerId: interviewSchedule.fkOrganizerId,
    })
    .from(interviewSlotChangeRequest)
    .innerJoin(
      userFlow,
      eq(interviewSlotChangeRequest.fkUserFlowId, userFlow.id),
    )
    .innerJoin(flow, eq(userFlow.fkFlowId, flow.id))
    .leftJoin(
      interviewSchedule,
      eq(interviewSlotChangeRequest.fkInterviewScheduleId, interviewSchedule.id),
    )
    .where(and(...conditions))
    .orderBy(desc(interviewSlotChangeRequest.createdAt));

  const userMap = await safeUserMap(rows.map((row) => row.userId));
  return rows.map((row) => ({
    id: row.id,
    userFlowId: row.userFlowId,
    flowId: row.flowId,
    flowTitle: row.flowTitle,
    flowType: row.flowType,
    department: row.department,
    userId: row.userId,
    candidateName: userMap.get(row.userId)?.name ?? null,
    candidateStudentId: userMap.get(row.userId)?.studentId ?? null,
    currentStartsAt: row.scheduleStartsAt,
    currentEndsAt: row.scheduleEndsAt,
    requestedStartsAt: row.requestedStartsAt,
    requestedEndsAt: row.requestedEndsAt,
    reason: row.reason,
    scheduleId: row.scheduleId,
    organizerId: row.organizerId,
    createdAt: row.createdAt,
  }));
};

export type RequestInterviewSlotChangeInput = {
  userFlowId: number;
  /** 申请改到的新开始时间（北京时间） */
  requestedStartsAt?: string;
  /** 申请理由（必填） */
  reason: string;
};

/** 候选人申请修改面试时间；同一报名只保留一条待审批申请 */
export const requestInterviewSlotChange = async ({
  userFlowId,
  requestedStartsAt,
  reason,
}: RequestInterviewSlotChangeInput): Promise<ActionResult> => {
  let session: Awaited<ReturnType<typeof verifySession>> | null = null;
  try {
    session = await verifySession();
    const normalizedReason = reason.trim();
    if (!normalizedReason) {
      return { success: false, error: { message: "请填写申请理由" } };
    }

    const [record] = await db
      .select({
        id: userFlow.id,
        uid: userFlow.fkUserId,
        department: userFlow.department,
        progressStatus: userFlow.progressStatus,
        flowId: flow.id,
        flowTitle: flow.title,
        flowType: flow.type,
      })
      .from(userFlow)
      .innerJoin(flow, eq(userFlow.fkFlowId, flow.id))
      .where(and(eq(userFlow.id, userFlowId), eq(flow.isDeleted, false)))
      .limit(1);

    if (!record) {
      return { success: false, error: { message: "报名记录不存在" } };
    }
    if (record.uid !== session.uid) {
      return {
        success: false,
        error: { message: "只能为自己的报名申请修改面试时间" },
      };
    }
    if (!editableStatuses.has(record.progressStatus ?? "")) {
      return {
        success: false,
        error: { message: "当前面试已结束，无法再修改面试时间" },
      };
    }

    if (!isTechInterviewFlow(record.flowType)) {
      /* 办公类等流程不再支持候选人自行改期：时段由部长在面试管理页直接修改 */
      return {
        success: false,
        error: { message: "该流程不支持修改面试时间" },
      };
    }

    const [schedule] = await db
      .select()
      .from(interviewSchedule)
      .where(
        and(
          eq(interviewSchedule.fkUserFlowId, userFlowId),
          eq(interviewSchedule.status, "created"),
        ),
      )
      .orderBy(desc(interviewSchedule.startsAt))
      .limit(1);
    if (!schedule) {
      return {
        success: false,
        error: { message: "当前没有可修改的面试日程，请先联系讲师预约面试" },
      };
    }
    const startsAt = parseRequestedTime(requestedStartsAt);
    if (!startsAt) {
      return { success: false, error: { message: "请选择要改到的面试时间" } };
    }
    if (startsAt.getTime() === schedule.startsAt.getTime()) {
      return { success: false, error: { message: "该时间与当前面试时间相同" } };
    }
    if (startsAt.getTime() < Date.now()) {
      return { success: false, error: { message: "请选择将来的面试时间" } };
    }
    const durationMs = schedule.endsAt.getTime() - schedule.startsAt.getTime();
    const payload = {
      requestedStartsAt: startsAt,
      /* 时长沿用原日程 */
      requestedEndsAt: new Date(startsAt.getTime() + durationMs),
      scheduleId: schedule.id,
    };

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
        fkInterviewScheduleId: payload.scheduleId,
        requestedStartsAt: payload.requestedStartsAt,
        requestedEndsAt: payload.requestedEndsAt,
        reason: normalizedReason,
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
      metadata: {
        flowId: record.flowId,
        requestedStartsAt: payload.requestedStartsAt?.toISOString() ?? null,
        reason: normalizedReason,
      },
    });

    await notifyOrganizerOfSlotChange({
      userFlowId,
      flowId: record.flowId,
      flowTitle: record.flowTitle,
      candidateName: session.name,
      requestedStartsAt: payload.requestedStartsAt,
      requestedEndsAt: payload.requestedEndsAt,
      reason: normalizedReason,
    });

    revalidatePath("/dashboard/user-flow");
    revalidatePath("/dashboard/interviews");
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

/** 提交申请后飞书提醒预约讲师（未绑定飞书等失败只记录，不影响申请） */
async function notifyOrganizerOfSlotChange({
  userFlowId,
  flowId,
  flowTitle,
  candidateName,
  requestedStartsAt,
  requestedEndsAt,
  reason,
}: {
  userFlowId: number;
  flowId: number;
  flowTitle: string;
  candidateName: string;
  requestedStartsAt: Date | null;
  requestedEndsAt: Date | null;
  reason: string;
}) {
  try {
    const [schedule] = await db
      .select({
        id: interviewSchedule.id,
        organizerId: interviewSchedule.fkOrganizerId,
        startsAt: interviewSchedule.startsAt,
        endsAt: interviewSchedule.endsAt,
      })
      .from(interviewSchedule)
      .where(
        and(
          eq(interviewSchedule.fkUserFlowId, userFlowId),
          eq(interviewSchedule.status, "created"),
        ),
      )
      .orderBy(desc(interviewSchedule.startsAt))
      .limit(1);
    if (!schedule) return;

    const credential = await getValidFeishuUserCredential(schedule.organizerId);
    await sendInterviewSlotChangeRequestCard({
      openId: credential.openId,
      flowName: flowTitle,
      candidateName,
      currentTimeText: `${formatMinute(schedule.startsAt)} - ${formatMinute(schedule.endsAt)}`,
      requestedTimeText:
        requestedStartsAt && requestedEndsAt
          ? `${formatMinute(requestedStartsAt)} - ${formatMinute(requestedEndsAt)}`
          : "待定",
      reason,
      flowId,
      userFlowId,
    });
  } catch (error) {
    logServerError("user-flow:slot-change:notifyOrganizer", error, {
      path: "/dashboard/user-flow",
      action: "notify-organizer-slot-change",
      userFlowId,
      metadata: { flowId },
    });
  }
}

type SlotChangeRejectedEmailInput = {
  candidateId: number;
  candidateName: string | null;
  candidateStudentId: string | null;
  flowTitle: string;
  department: string | null;
  flowId: number;
  userFlowId: number;
  scheduleId: number | null;
  reviewerId: number;
  reviewerName: string;
  /** 原面试时间与申请改到的时间 */
  originalStartsAt?: Date | null;
  originalEndsAt?: Date | null;
  requestedTimeText?: string | null;
  reason?: string | null;
};

/**
 * 暂不改期的说明邮件：告知候选人本次暂不调整面试时间，并附说明。
 * （同意改期由飞书日程改约流程统一发通知，不在这里发。）
 */
async function sendSlotChangeRejectedEmail({
  candidateId,
  candidateName,
  candidateStudentId,
  flowTitle,
  department,
  flowId,
  userFlowId,
  scheduleId,
  reviewerId,
  reviewerName,
  originalStartsAt,
  originalEndsAt,
  requestedTimeText,
  reason,
}: SlotChangeRejectedEmailInput) {
  try {
    if (!candidateStudentId) {
      throw new Error("候选人的学号为空，无法解析教育邮箱");
    }
    const toAddress = getEducationEmail(candidateStudentId);
    await createRenderedEmailDelivery({
      templateKey: "interview.schedule.change.rejected",
      toAddress,
      recipientUserId: candidateId,
      userFlowId,
      flowId,
      relatedScheduleId: scheduleId,
      createdBy: reviewerId,
      department,
      variables: {
        candidateName: candidateName ?? "同学",
        flowName: flowTitle,
        organizerName: reviewerName,
        organizerLabel: "讲师",
        startsAt: originalStartsAt ?? null,
        endsAt: originalEndsAt ?? null,
        requestedTimeText: requestedTimeText ?? null,
        reason: reason ?? null,
      },
      metadata: {
        kind: "rejected",
        flowId,
        department,
        slotChangeDecision: "rejected",
      },
      sendImmediately: true,
    });
  } catch (error) {
    logServerError("email-center:slotChangeDecision", error, {
      action: "send-slot-change-rejected-email",
      userFlowId,
      targetUserId: candidateId,
      metadata: { flowId, scheduleId },
    });
  }
}

/**
 * 处理改约申请：技术部门由**预约该日程的讲师**处理（同意后同步飞书日程/留档会议并发改约邮件）。
 * 暂不改期必须填写说明，并邮件告知候选人。
 */
export const reviewInterviewSlotChange = async (
  requestId: number,
  approved: boolean,
  options?: { reviewNote?: string },
): Promise<ReviewSlotChangeResult> => {
  let session: Awaited<ReturnType<typeof verifyScopedRole>> | null = null;
  try {
    session = await verifyScopedRole(LECTURER_ROLE);

    const [record] = await db
      .select({
        id: interviewSlotChangeRequest.id,
        userFlowId: interviewSlotChangeRequest.fkUserFlowId,
        requestedStartsAt: interviewSlotChangeRequest.requestedStartsAt,
        requestedEndsAt: interviewSlotChangeRequest.requestedEndsAt,
        reason: interviewSlotChangeRequest.reason,
        status: interviewSlotChangeRequest.status,
        scheduleId: interviewSlotChangeRequest.fkInterviewScheduleId,
        rowDepartment: userFlow.department,
        candidateId: userFlow.fkUserId,
        flowId: flow.id,
        flowTitle: flow.title,
        flowType: flow.type,
      })
      .from(interviewSlotChangeRequest)
      .innerJoin(
        userFlow,
        eq(interviewSlotChangeRequest.fkUserFlowId, userFlow.id),
      )
      .innerJoin(flow, eq(userFlow.fkFlowId, flow.id))
      .where(eq(interviewSlotChangeRequest.id, requestId))
      .limit(1);

    if (!record) throw new Error("改期申请不存在");
    if (record.status !== "pending") throw new Error("该申请已处理");

    const [schedule] = record.scheduleId
      ? await db
          .select()
          .from(interviewSchedule)
          .where(eq(interviewSchedule.id, record.scheduleId))
          .limit(1)
      : [];

    if (!isTechInterviewFlow(record.flowType)) {
      throw new Error("该流程不支持修改面试时间");
    }
    if (!schedule) throw new Error("该改约申请没有关联的面试日程");
    /* 改约申请只由预约该日程的讲师处理（管理员也不例外） */
    if (schedule.fkOrganizerId !== session.uid) {
      throw new Error("只能由预约的讲师处理该改约申请");
    }
    if (schedule.status !== "created") {
      throw new Error("该面试日程已取消或结束，请告知候选人暂不改期");
    }

    const userMap = await safeUserMap([record.candidateId]);
    const candidate = userMap.get(record.candidateId) ?? null;

    const reviewNote = options?.reviewNote?.trim() ?? "";

    if (!approved) {
      if (!reviewNote) {
        return { success: false, error: { message: "请填写暂不改期的说明" } };
      }
      const updated = await db
        .update(interviewSlotChangeRequest)
        .set({
          status: "rejected",
          fkReviewedBy: session.uid,
          reviewNote,
          reviewedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(interviewSlotChangeRequest.id, requestId),
            eq(interviewSlotChangeRequest.status, "pending"),
          ),
        )
        .returning({ id: interviewSlotChangeRequest.id });
      if (updated.length === 0) throw new Error("该申请已处理");

      await sendSlotChangeRejectedEmail({
        candidateId: record.candidateId,
        candidateName: candidate?.name ?? null,
        candidateStudentId: candidate?.studentId ?? null,
        flowTitle: record.flowTitle,
        department: record.rowDepartment,
        flowId: record.flowId,
        userFlowId: record.userFlowId,
        scheduleId: record.scheduleId,
        reviewerId: session.uid,
        reviewerName: session.name,
        originalStartsAt: schedule?.startsAt ?? null,
        originalEndsAt: schedule?.endsAt ?? null,
        requestedTimeText: record.requestedStartsAt
          ? formatMinute(record.requestedStartsAt)
          : null,
        reason: reviewNote,
      });

      await writeOperationAudit({
        actorId: session.uid,
        actorRole: session.role,
        action: "user_flow.interview_slot.review",
        resourceType: "interview_slot_change_request",
        resourceId: requestId,
        department: record.rowDepartment,
        metadata: {
          approved: false,
          flowId: record.flowId,
          reviewNote,
        },
      });
      revalidatePath("/dashboard/interviews");
      revalidatePath("/dashboard/user-flow");
      return { success: true };
    }

    /* 技术部门：按申请时间改飞书日程（含留档会议），邮件/提醒/卡片由日程改约流程统一发送 */
    if (!record.requestedStartsAt || !record.requestedEndsAt) {
      throw new Error("该改期申请缺少新的面试时间");
    }
    const rescheduleResult = await createInterviewSchedule({
      userFlowId: record.userFlowId,
      startsAt: toScheduleInput(record.requestedStartsAt),
      endsAt: toScheduleInput(record.requestedEndsAt),
      location: schedule.location ?? undefined,
      meetingRoomId: schedule.meetingRoomId ?? undefined,
    });
    if (!rescheduleResult.success) {
      return { success: false, error: rescheduleResult.error };
    }

    const updated = await db
      .update(interviewSlotChangeRequest)
      .set({
        status: "approved",
        fkReviewedBy: session.uid,
        reviewNote: reviewNote || null,
        reviewedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(interviewSlotChangeRequest.id, requestId),
          eq(interviewSlotChangeRequest.status, "pending"),
        ),
      )
      .returning({ id: interviewSlotChangeRequest.id });
    if (updated.length === 0) {
      throw new Error("该申请已处理");
    }

    await writeOperationAudit({
      actorId: session.uid,
      actorRole: session.role,
      action: "user_flow.interview_slot.review",
      resourceType: "interview_slot_change_request",
      resourceId: requestId,
      department: record.rowDepartment,
      metadata: {
        approved: true,
        flowId: record.flowId,
        appliedStartsAt: record.requestedStartsAt.toISOString(),
        appliedEndsAt: record.requestedEndsAt.toISOString(),
        reviewNote: reviewNote || null,
      },
    });
    revalidatePath("/dashboard/interviews");
    revalidatePath("/dashboard/user-flow");
    return { success: true, appliedStartsAt: record.requestedStartsAt };
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
