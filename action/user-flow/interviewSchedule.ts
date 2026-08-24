"use server";

import { db } from "@/db/drizzle";
import {
  flow,
  interviewEvaluation,
  interviewSchedule,
  userFlow,
} from "@/db/schema";
import { createRenderedEmailDelivery } from "@/lib/email-center/delivery";
import { renderEmailTemplate } from "@/lib/email-center/render";
import { getEducationEmail } from "@/lib/email/address";
import { getInterviewMeetingRoom } from "@/lib/interview-meeting-rooms";
import {
  cancelFeishuInterviewSchedule,
  createFeishuInterviewSchedule,
  getFeishuInterviewCalendarId,
  getFeishuCalendarEvent,
  isFeishuEventNotFoundError,
  isFeishuInternalServiceError,
  subscribeFeishuCalendarEventChanges,
  updateFeishuInterviewSchedule,
} from "@/lib/feishu/interview-schedule";
import {
  sendInterviewCancelledCard,
  sendInterviewScheduleCard,
} from "@/lib/feishu/interview-message";
import { getValidFeishuUserCredential } from "@/lib/feishu/oauth-account";
import { listPeopleUsersByLinkIds } from "@/lib/link/user-lookup";
import { writeOperationAudit } from "@/lib/operation-audit";
import { logServerError } from "@/lib/server-error-log";
import { verifyRole } from "@/lib/dal";
import { mqClient } from "@/queue/client";
import { and, desc, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getFeishuCalendarSubscriptionCacheKey } from "./interviewSchedule-utils";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

const DEFAULT_TIMEZONE = "Asia/Shanghai";
const feishuCalendarSubscriptionCache = new Set<string>();
const interviewEmailTemplateKey = {
  created: "interview.schedule.created",
  rescheduled: "interview.schedule.rescheduled",
  cancelled: "interview.schedule.cancelled",
} as const;

type CreateInterviewScheduleInput = {
  userFlowId: number;
  startsAt: string;
  endsAt: string;
  location?: string;
  meetingRoomId?: string;
  note?: string;
};

type CreateInterviewScheduleResult =
  | {
      success: true;
      data: {
        id: number;
        meetingLink: string;
        scheduleLink?: string;
        emailWarning?: string;
      };
    }
  | {
      success: false;
      error: {
        message: string;
      };
    };

type PreviewInterviewScheduleEmailResult =
  | {
      success: true;
      data: {
        subject: string;
        to: string;
        html: string;
      };
    }
  | {
      success: false;
      error: {
        message: string;
      };
    };

type CancelInterviewScheduleResult =
  | {
      success: true;
      emailWarning?: string;
    }
  | {
      success: false;
      error: {
        message: string;
      };
    };

type ConfirmInterviewScheduleEndedResult =
  | { success: true }
  | {
      success: false;
      error: {
        message: string;
      };
    };

function parseDate(value: string, fieldName: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`${fieldName} 时间格式不正确`);
  }
  return date;
}

function getScheduleRoom(input: CreateInterviewScheduleInput) {
  const meetingRoomId = input.meetingRoomId?.trim();
  if (!meetingRoomId) return undefined;

  const room = getInterviewMeetingRoom(meetingRoomId);
  if (!room) {
    throw new Error("所选会议室不可用，请刷新页面后重试。");
  }
  return room;
}

async function sendInterviewEmailDelivery({
  kind,
  toAddress,
  recipientUserId,
  userFlowId,
  flowId,
  scheduleId,
  createdBy,
  variables,
}: {
  kind: keyof typeof interviewEmailTemplateKey;
  toAddress: string;
  recipientUserId: number;
  userFlowId: number;
  flowId?: number | null;
  scheduleId: number;
  createdBy: number;
  variables: {
    candidateName: string;
    flowName: string;
    organizerName: string;
    startsAt: Date;
    endsAt: Date;
    location?: string | null;
    note?: string;
  };
}): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    await createRenderedEmailDelivery({
      templateKey: interviewEmailTemplateKey[kind],
      toAddress,
      flowId,
      recipientUserId,
      userFlowId,
      relatedScheduleId: scheduleId,
      createdBy,
      variables,
      metadata: {
        kind,
        flowId: flowId ?? null,
      },
      sendImmediately: true,
    });
    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "邮件发送失败";
    logServerError("email-center:interviewDelivery", error, {
      action: "send-interview-email-delivery",
      userFlowId,
      targetUserId: recipientUserId,
      metadata: {
        kind,
        flowId: flowId ?? null,
        scheduleId,
      },
    });
    return { ok: false, message };
  }
}

async function notifyOrganizerByFeishu({
  title = "线下面试日程已创建",
  organizerOpenId,
  candidateName,
  candidateQq,
  candidateStudentId,
  flowName,
  startsAt,
  endsAt,
  location,
  meetingLink,
  scheduleLink,
  userFlowId,
  scheduleId,
}: {
  title?: string;
  organizerOpenId: string;
  candidateName: string;
  candidateQq?: string | null;
  candidateStudentId?: string | null;
  flowName: string;
  startsAt: Date;
  endsAt: Date;
  location?: string | null;
  meetingLink: string;
  scheduleLink?: string;
  userFlowId: number;
  scheduleId: number;
}) {
  try {
    await sendInterviewScheduleCard({
      openId: organizerOpenId,
      title,
      candidateName,
      candidateQq,
      candidateStudentId,
      flowName,
      startsAt,
      endsAt,
      location,
      meetingLink,
      scheduleLink,
      userFlowId,
      scheduleId,
    });
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.error("send interview schedule feishu message failed", error);
    }
    logServerError("interviewSchedule:feishuMessage", error, {
      action: "send-interview-schedule-feishu-message",
      userFlowId,
      metadata: {
        scheduleId,
      },
    });
  }
}

async function notifyInterviewGroupByFeishu({
  title,
  candidateName,
  candidateStudentId,
  candidateQq,
  flowName,
  startsAt,
  endsAt,
  location,
  meetingLink,
  scheduleLink,
  userFlowId,
  scheduleId,
}: {
  title: string;
  candidateName: string;
  candidateStudentId?: string | null;
  candidateQq?: string | null;
  flowName: string;
  startsAt: Date;
  endsAt: Date;
  location?: string | null;
  meetingLink?: string | null;
  scheduleLink?: string | null;
  userFlowId: number;
  scheduleId: number;
}) {
  const chatId = process.env.FEISHU_INTERVIEW_CHAT_ID?.trim();
  if (!chatId) return;

  try {
    await sendInterviewScheduleCard({
      openId: chatId,
      receiveIdType: "chat_id",
      title,
      candidateName,
      candidateStudentId,
      candidateQq,
      flowName,
      startsAt,
      endsAt,
      location,
      meetingLink,
      scheduleLink,
      userFlowId,
      scheduleId,
      uuidSuffix: `group-${Date.now()}`,
    });
  } catch (error) {
    logServerError("interviewSchedule:feishuGroupMessage", error, {
      action: "send-interview-schedule-feishu-group-message",
      userFlowId,
      metadata: { scheduleId },
    });
  }
}

export async function previewInterviewScheduleEmail(
  input: CreateInterviewScheduleInput,
): Promise<PreviewInterviewScheduleEmailResult> {
  const session = await verifyRole(2);
  const startsAt = parseDate(input.startsAt, "开始");
  const endsAt = parseDate(input.endsAt, "结束");
  if (endsAt <= startsAt) {
    return { success: false, error: { message: "结束时间必须晚于开始时间" } };
  }

  const [target] = await db
    .select({
      userFlowId: userFlow.id,
      candidateId: userFlow.fkUserId,
      flowTitle: flow.title,
    })
    .from(userFlow)
    .innerJoin(flow, eq(flow.id, userFlow.fkFlowId))
    .where(eq(userFlow.id, input.userFlowId))
    .limit(1);

  if (!target) {
    return { success: false, error: { message: "面试同学流程不存在" } };
  }

  const userMap = await listPeopleUsersByLinkIds([target.candidateId, session.uid], {
    canViewSensitiveInfo: true,
  });
  const candidate = userMap.get(target.candidateId);
  const organizer = userMap.get(session.uid);
  const attendeeEmail = getEducationEmail(candidate?.studentId);
  const candidateName = candidate?.name ?? "同学";
  const organizerName = organizer?.name ?? session.name;
  const room = getScheduleRoom(input);
  const location = (room?.name ?? input.location?.trim()) || undefined;
  const note = input.note?.trim() || undefined;

  const [existingSchedule] = await db
    .select({ id: interviewSchedule.id })
    .from(interviewSchedule)
    .where(
      and(
        eq(interviewSchedule.fkUserFlowId, input.userFlowId),
        eq(interviewSchedule.status, "created"),
      ),
    )
    .limit(1);
  const kind = existingSchedule ? "rescheduled" : "created";
  const rendered = await renderEmailTemplate({
    templateKey: interviewEmailTemplateKey[kind],
    variables: {
      candidateName,
      flowName: target.flowTitle,
      organizerName,
      startsAt,
      endsAt,
      location,
      note,
    },
  });

  return {
    success: true,
    data: {
      subject: rendered.subject,
      to: attendeeEmail,
      html: rendered.html,
    },
  };
}

export async function createInterviewSchedule(
  input: CreateInterviewScheduleInput,
): Promise<CreateInterviewScheduleResult> {
  let session: Awaited<ReturnType<typeof verifyRole>> | null = null;

  try {
    session = await verifyRole(2);
    const organizerId = session.uid;

    const startsAt = parseDate(input.startsAt, "开始");
    const endsAt = parseDate(input.endsAt, "结束");
    if (endsAt <= startsAt) {
      return { success: false, error: { message: "结束时间必须晚于开始时间" } };
    }

    const [target] = await db
      .select({
        userFlowId: userFlow.id,
        candidateId: userFlow.fkUserId,
        flowId: flow.id,
        flowTitle: flow.title,
        flowType: flow.type,
        progressStatus: userFlow.progressStatus,
      })
      .from(userFlow)
      .innerJoin(flow, eq(flow.id, userFlow.fkFlowId))
      .where(eq(userFlow.id, input.userFlowId))
      .limit(1);

    if (!target) {
      return { success: false, error: { message: "面试同学流程不存在" } };
    }
    if (target.flowType === "recruitment") {
      return { success: false, error: { message: "笔试流程不支持发起面试日程" } };
    }
    if (target.progressStatus !== "ongoing") {
      return { success: false, error: { message: "只有进行中的面试流程可以预约日程" } };
    }

    const userMap = await listPeopleUsersByLinkIds(
      [target.candidateId, session.uid],
      { canViewSensitiveInfo: true },
    );
    const candidate = userMap.get(target.candidateId);
    const organizer = userMap.get(session.uid);
    const attendeeEmail = getEducationEmail(candidate?.studentId);
    const organizerName = organizer?.name ?? session.name;
    const candidateName = candidate?.name ?? "同学";
    const summary = `${target.flowTitle} 线下面试 - ${candidateName}`;
    const room = getScheduleRoom(input);
    const location = (room?.name ?? input.location?.trim()) || undefined;
    const note = input.note?.trim() || undefined;
    const description = [
      `面试同学：${candidateName}`,
      candidate?.studentId ? `学号：${candidate.studentId}` : null,
      candidate?.qq ? `QQ：${candidate.qq}` : null,
      "本次为线下面试；飞书会议仅用于录制与妙记留档。",
    ].filter(Boolean).join("\n");

    const credential = await getValidFeishuUserCredential(session.uid);
    const [existingSchedule] = await db
      .select()
      .from(interviewSchedule)
      .where(
        and(
          eq(interviewSchedule.fkUserFlowId, input.userFlowId),
          eq(interviewSchedule.status, "created"),
        ),
      )
      .orderBy(desc(interviewSchedule.startsAt))
      .limit(1);
    const calendarId = existingSchedule?.providerCalendarId ?? getFeishuInterviewCalendarId();

    if (existingSchedule && existingSchedule.fkOrganizerId !== session.uid) {
      return {
        success: false,
        error: { message: "只能由原预约讲师改约该面试。" },
      };
    }

    if (existingSchedule && !existingSchedule.providerEventId) {
      return {
        success: false,
        error: { message: "该预约缺少飞书日程 ID，无法改约，请先取消后重新预约。" },
      };
    }
    if (existingSchedule?.meetingStatus === "ended") {
      return {
        success: false,
        error: { message: "该面试已经结束，不能再改约。" },
      };
    }

    const subscriptionCacheKey = getFeishuCalendarSubscriptionCacheKey(session.uid, calendarId);
    if (!feishuCalendarSubscriptionCache.has(subscriptionCacheKey)) {
      try {
        await subscribeFeishuCalendarEventChanges(credential.accessToken, calendarId);
        feishuCalendarSubscriptionCache.add(subscriptionCacheKey);
      } catch (error) {
        // Calendar change events are an enhancement; scheduling must still work
        // when the tenant has not enabled this subscription capability yet.
        logServerError("interviewSchedule:feishuSubscription", error, {
          action: "subscribe-feishu-calendar-event-changes",
          userId: session.uid,
        });
      }
    }

    let feishuSchedule: Awaited<ReturnType<typeof createFeishuInterviewSchedule>>;
    if (existingSchedule) {
      try {
        feishuSchedule = await updateFeishuInterviewSchedule({
          accessToken: credential.accessToken,
          organizerOpenId: credential.openId,
          calendarId,
          eventId: existingSchedule.providerEventId as string,
          reserveId: existingSchedule.providerReserveId,
          currentMeetingLink: existingSchedule.meetingLink,
          summary,
          description,
          location,
          meetingRoomId: room?.id,
          previousMeetingRoomId: existingSchedule.meetingRoomId,
          startsAt,
          endsAt,
          timezone: DEFAULT_TIMEZONE,
        });
      } catch (error) {
        if (!isFeishuEventNotFoundError(error) && !isFeishuInternalServiceError(error)) {
          throw error;
        }

        logServerError("interviewSchedule:feishuEventRecovery", error, {
          action: "recreate-missing-feishu-calendar-event",
          userFlowId: input.userFlowId,
          metadata: {
            scheduleId: existingSchedule.id,
            providerEventId: existingSchedule.providerEventId,
          },
        });

        feishuSchedule = await createFeishuInterviewSchedule({
          accessToken: credential.accessToken,
          organizerOpenId: credential.openId,
          calendarId,
          summary,
          description,
          location,
          meetingRoomId: room?.id,
          startsAt,
          endsAt,
          timezone: DEFAULT_TIMEZONE,
          idempotencyKey: `people-interview-${input.userFlowId}-${startsAt.getTime()}-${endsAt.getTime()}-recreate`,
        });
      }
    } else {
      feishuSchedule = await createFeishuInterviewSchedule({
        accessToken: credential.accessToken,
        organizerOpenId: credential.openId,
        calendarId,
        summary,
        description,
        location,
        meetingRoomId: room?.id,
        startsAt,
        endsAt,
        timezone: DEFAULT_TIMEZONE,
        idempotencyKey: `people-interview-${input.userFlowId}-${startsAt.getTime()}-${endsAt.getTime()}`,
      });
    }

    const scheduleWrite = await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(${input.userFlowId})`);
      const [currentFlow] = await tx
        .select({ progressStatus: userFlow.progressStatus })
        .from(userFlow)
        .where(eq(userFlow.id, input.userFlowId))
        .limit(1);
      if (currentFlow?.progressStatus !== "ongoing") {
        return {
          success: false as const,
          error: { message: "该面试流程已结束或已退回，无法创建日程。" },
        };
      }

      const [schedule] = existingSchedule
        ? await tx
            .update(interviewSchedule)
          .set({
            providerEventId: feishuSchedule.eventId,
            providerCalendarId: calendarId,
            providerReserveId: feishuSchedule.reserveId,
            providerMeetingId:
              feishuSchedule.meetingId ?? existingSchedule.providerMeetingId,
            providerMeetingNo: feishuSchedule.meetingNo ?? existingSchedule.providerMeetingNo,
            meetingLink: feishuSchedule.meetingLink,
            scheduleLink: feishuSchedule.scheduleLink,
            summary,
            description,
            location: location ?? null,
            meetingRoomId: room?.id ?? null,
            attendeeEmail,
            startsAt,
            endsAt,
            timezone: DEFAULT_TIMEZONE,
            updatedAt: new Date(),
          })
            .where(eq(interviewSchedule.id, existingSchedule.id))
            .returning({ id: interviewSchedule.id })
        : await tx
            .insert(interviewSchedule)
          .values({
            fkUserFlowId: input.userFlowId,
            fkOrganizerId: organizerId,
            providerCalendarId: calendarId,
            providerEventId: feishuSchedule.eventId,
            providerReserveId: feishuSchedule.reserveId,
            providerMeetingId: feishuSchedule.meetingId,
            providerMeetingNo: feishuSchedule.meetingNo,
            meetingLink: feishuSchedule.meetingLink,
            scheduleLink: feishuSchedule.scheduleLink,
            summary,
            description,
            location: location ?? null,
            meetingRoomId: room?.id ?? null,
            attendeeEmail,
            startsAt,
            endsAt,
            timezone: DEFAULT_TIMEZONE,
            status: "created",
          })
            .returning({ id: interviewSchedule.id });
      return schedule
        ? { success: true as const, data: schedule }
        : {
            success: false as const,
            error: { message: "面试日程保存失败，请刷新后重试。" },
          };
    });

    if (!scheduleWrite.success) {
      try {
        await cancelFeishuInterviewSchedule({
          accessToken: credential.accessToken,
          calendarId,
          eventId: feishuSchedule.eventId,
          reserveId: feishuSchedule.reserveId,
        });
      } catch (error) {
        logServerError("interviewSchedule:orphanedFeishuEvent", error, {
          action: "cancel-orphaned-feishu-interview-event",
          userFlowId: input.userFlowId,
          metadata: { eventId: feishuSchedule.eventId },
        });
      }
      return scheduleWrite;
    }
    const schedule = scheduleWrite.data;

    const emailKind = existingSchedule ? "rescheduled" : "created";
    const emailResult = await sendInterviewEmailDelivery({
      kind: emailKind,
      toAddress: attendeeEmail,
      recipientUserId: target.candidateId,
      userFlowId: input.userFlowId,
      flowId: target.flowId,
      scheduleId: schedule.id,
      createdBy: session.uid,
      variables: {
        candidateName,
        flowName: target.flowTitle,
        organizerName,
        startsAt,
        endsAt,
        location,
        note,
      },
    });

    await notifyOrganizerByFeishu({
      title: existingSchedule ? "线下面试日程已改约" : "线下面试日程已创建",
      organizerOpenId: credential.openId,
      candidateName,
      candidateQq: candidate?.qq ?? null,
      candidateStudentId: candidate?.studentId ?? null,
      flowName: target.flowTitle,
      startsAt,
      endsAt,
      location,
      meetingLink: feishuSchedule.meetingLink,
      scheduleLink: feishuSchedule.scheduleLink,
      userFlowId: input.userFlowId,
      scheduleId: schedule.id,
    });
    await notifyInterviewGroupByFeishu({
      title: existingSchedule ? "线下面试日程已改约" : "线下面试日程已创建",
      candidateName,
      candidateStudentId: candidate?.studentId ?? null,
      candidateQq: candidate?.qq ?? null,
      flowName: target.flowTitle,
      startsAt,
      endsAt,
      location,
      meetingLink: feishuSchedule.meetingLink,
      scheduleLink: feishuSchedule.scheduleLink,
      userFlowId: input.userFlowId,
      scheduleId: schedule.id,
    });
    await enqueueInterviewScheduleReminder({
      scheduleId: schedule.id,
      startsAt,
      endsAt,
    });

    revalidatePath("/dashboard/interviews");
    await writeOperationAudit({
      actorId: session.uid,
      actorRole: session.role,
      action: existingSchedule ? "interview_schedule.update" : "interview_schedule.create",
      resourceType: "interview_schedule",
      resourceId: schedule.id,
      metadata: {
        userFlowId: input.userFlowId,
        flowId: target.flowId,
        provider: "feishu",
        providerEventId: feishuSchedule.eventId,
        meetingRoomId: room?.id ?? null,
      },
    });

    return {
      success: true,
      data: {
        id: schedule.id,
        meetingLink: feishuSchedule.meetingLink,
        scheduleLink: feishuSchedule.scheduleLink,
        emailWarning: emailResult.ok
          ? undefined
          : `面试日程已创建，但预约邮件发送失败：${emailResult.message}`,
      },
    };
  } catch (error) {
    logServerError("interviewSchedule:create", error, {
      path: "/dashboard/interviews",
      userId: session?.uid ?? null,
      role: session?.role ?? null,
      action: "create-interview-schedule",
      userFlowId: input.userFlowId,
    });
    throw error;
  }
}

export async function cancelInterviewSchedule(
  scheduleId: number,
  options?: { allowAdmin?: boolean; tx?: Tx },
): Promise<CancelInterviewScheduleResult> {
  let session: Awaited<ReturnType<typeof verifyRole>> | null = null;
  const client = options?.tx ?? db;

  try {
    session = await verifyRole(2);

    const [schedule] = await client
      .select({
        id: interviewSchedule.id,
        userFlowId: interviewSchedule.fkUserFlowId,
        organizerId: interviewSchedule.fkOrganizerId,
        providerEventId: interviewSchedule.providerEventId,
        providerCalendarId: interviewSchedule.providerCalendarId,
        providerReserveId: interviewSchedule.providerReserveId,
        summary: interviewSchedule.summary,
        attendeeEmail: interviewSchedule.attendeeEmail,
        location: interviewSchedule.location,
        startsAt: interviewSchedule.startsAt,
        endsAt: interviewSchedule.endsAt,
        status: interviewSchedule.status,
        meetingStatus: interviewSchedule.meetingStatus,
      })
      .from(interviewSchedule)
      .where(eq(interviewSchedule.id, scheduleId))
      .limit(1);

    if (!schedule) {
      return { success: false, error: { message: "面试预约不存在。" } };
    }
    if (schedule.status !== "created") {
      return { success: false, error: { message: "该预约已经不是可取消状态。" } };
    }
    if (schedule.meetingStatus === "ended") {
      return { success: false, error: { message: "该面试已经结束，不能取消。" } };
    }
    if (
      schedule.organizerId !== session.uid &&
      !(options?.allowAdmin && session.role >= 3)
    ) {
      return { success: false, error: { message: "只能由原预约讲师取消该面试。" } };
    }

    const credential = await getValidFeishuUserCredential(schedule.organizerId);
    await cancelFeishuInterviewSchedule({
      accessToken: credential.accessToken,
      calendarId: schedule.providerCalendarId,
      eventId: schedule.providerEventId,
      reserveId: schedule.providerReserveId,
    });

    await client
      .update(interviewSchedule)
      .set({
        status: "cancelled",
        updatedAt: new Date(),
      })
      .where(eq(interviewSchedule.id, schedule.id));

    const [target] = await client
      .select({
        userFlowId: userFlow.id,
        candidateId: userFlow.fkUserId,
        flowId: flow.id,
        flowTitle: flow.title,
      })
      .from(userFlow)
      .innerJoin(flow, eq(flow.id, userFlow.fkFlowId))
      .where(eq(userFlow.id, schedule.userFlowId))
      .limit(1);
    const userMap = target
      ? await listPeopleUsersByLinkIds(
          [target.candidateId, schedule.organizerId, session.uid],
          {
          canViewSensitiveInfo: true,
          },
        )
      : new Map();
    const candidate = target ? userMap.get(target.candidateId) : null;
    const organizer = userMap.get(schedule.organizerId);
    const candidateName = candidate?.name ?? "同学";
    const flowName = target?.flowTitle ?? schedule.summary;
    const organizerName = organizer?.name ?? session.name;
    let emailWarning: string | undefined;
    if (schedule.attendeeEmail && target) {
      const emailResult = await sendInterviewEmailDelivery({
        kind: "cancelled",
        toAddress: schedule.attendeeEmail,
        recipientUserId: target.candidateId,
        userFlowId: schedule.userFlowId,
        flowId: target.flowId,
        scheduleId: schedule.id,
        createdBy: session.uid,
        variables: {
          candidateName,
          flowName,
          organizerName,
          startsAt: schedule.startsAt,
          endsAt: schedule.endsAt,
          location: schedule.location,
        },
      });
      if (!emailResult.ok) {
        emailWarning = `面试预约已取消，但取消邮件发送失败：${emailResult.message}`;
      }
    }

    try {
      await sendInterviewCancelledCard({
        openId: credential.openId,
        flowName,
        candidateName,
        startsAt: schedule.startsAt,
        endsAt: schedule.endsAt,
        location: schedule.location,
        scheduleId: schedule.id,
      });
    } catch (error) {
      logServerError("interviewSchedule:feishuMessage", error, {
        action: "send-interview-cancel-feishu-message",
        userFlowId: schedule.userFlowId,
        metadata: { scheduleId: schedule.id },
      });
    }
    const chatId = process.env.FEISHU_INTERVIEW_CHAT_ID?.trim();
    if (chatId) {
      try {
        await sendInterviewCancelledCard({
          openId: chatId,
          receiveIdType: "chat_id",
          flowName,
          candidateName,
          startsAt: schedule.startsAt,
          endsAt: schedule.endsAt,
          location: schedule.location,
          scheduleId: schedule.id,
        });
      } catch (error) {
        logServerError("interviewSchedule:feishuGroupMessage", error, {
          action: "send-interview-cancel-feishu-group-message",
          userFlowId: schedule.userFlowId,
          metadata: { scheduleId: schedule.id },
        });
      }
    }

    revalidatePath("/dashboard/interviews");
    try {
      await writeOperationAudit({
        actorId: session.uid,
        actorRole: session.role,
        action: "interview_schedule.cancel",
        resourceType: "interview_schedule",
        resourceId: schedule.id,
        metadata: {
          userFlowId: schedule.userFlowId,
          provider: "feishu",
          providerEventId: schedule.providerEventId,
        },
      });
    } catch (error) {
      logServerError("interviewSchedule:cancelAudit", error, {
        action: "audit-interview-schedule-cancel",
        userFlowId: schedule.userFlowId,
        metadata: { scheduleId: schedule.id },
      });
    }

    return { success: true, emailWarning };
  } catch (error) {
    logServerError("interviewSchedule:cancel", error, {
      path: "/dashboard/interviews",
      userId: session?.uid ?? null,
      role: session?.role ?? null,
      action: "cancel-interview-schedule",
      metadata: {
        scheduleId,
      },
    });
    throw error;
  }
}

export async function returnInterviewCandidate(userFlowId: number) {
  let session: Awaited<ReturnType<typeof verifyRole>> | null = null;

  try {
    session = await verifyRole(2);

    const [candidate] = await db
      .select({
        userFlowId: userFlow.id,
        progressStatus: userFlow.progressStatus,
        flowType: flow.type,
        evaluationStatus: interviewEvaluation.status,
        scheduleId: interviewSchedule.id,
        scheduleOrganizerId: interviewSchedule.fkOrganizerId,
        scheduleMeetingStatus: interviewSchedule.meetingStatus,
      })
      .from(userFlow)
      .innerJoin(flow, eq(flow.id, userFlow.fkFlowId))
      .leftJoin(
        interviewEvaluation,
        and(
          eq(interviewEvaluation.fkUserFlowId, userFlow.id),
          eq(interviewEvaluation.status, "submitted"),
        ),
      )
      .leftJoin(
        interviewSchedule,
        and(
          eq(interviewSchedule.fkUserFlowId, userFlow.id),
          eq(interviewSchedule.status, "created"),
        ),
      )
      .where(eq(userFlow.id, userFlowId))
      .orderBy(desc(interviewSchedule.updatedAt))
      .limit(1);

    if (!candidate) {
      return { success: false, error: { message: "找不到该面试报名。" } };
    }
    if (candidate.flowType === "recruitment") {
      return { success: false, error: { message: "笔试流程不支持退回面试报名。" } };
    }
    if (candidate.progressStatus !== "ongoing") {
      return { success: false, error: { message: "只有进行中的面试流程可以退回。" } };
    }
    if (candidate.evaluationStatus) {
      return { success: false, error: { message: "该面试已经提交面评，不能退回。" } };
    }
    if (
      candidate.scheduleId &&
      candidate.scheduleMeetingStatus === "ended"
    ) {
      return { success: false, error: { message: "该面试已经结束，不能退回。" } };
    }
    if (
      candidate.scheduleOrganizerId &&
      candidate.scheduleOrganizerId !== session.uid &&
      session.role < 3
    ) {
      return { success: false, error: { message: "只能由原预约讲师或管理员退回。" } };
    }

    const withdrawalResult = await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(${userFlowId})`);

      const [current] = await tx
        .select({
          progressStatus: userFlow.progressStatus,
          evaluationStatus: interviewEvaluation.status,
        })
        .from(userFlow)
        .leftJoin(
          interviewEvaluation,
          and(
            eq(interviewEvaluation.fkUserFlowId, userFlow.id),
            eq(interviewEvaluation.status, "submitted"),
          ),
        )
        .where(eq(userFlow.id, userFlowId))
        .limit(1);
      const [currentSchedule] = await tx
        .select({
          id: interviewSchedule.id,
          meetingStatus: interviewSchedule.meetingStatus,
        })
        .from(interviewSchedule)
        .where(
          and(
            eq(interviewSchedule.fkUserFlowId, userFlowId),
            eq(interviewSchedule.status, "created"),
          ),
        )
        .orderBy(desc(interviewSchedule.updatedAt))
        .limit(1);

      if (!current || current.progressStatus !== "ongoing") {
        return {
          success: false as const,
          error: { message: "该面试状态已发生变化，请刷新后重试。" },
        };
      }
      if (current.evaluationStatus) {
        return {
          success: false as const,
          error: { message: "该面试已经提交面评，不能退回。" },
        };
      }
      if (currentSchedule?.meetingStatus === "ended") {
        return {
          success: false as const,
          error: { message: "该面试已经结束，不能退回。" },
        };
      }

      if (currentSchedule) {
        const cancelResult = await cancelInterviewSchedule(currentSchedule.id, {
          allowAdmin: true,
          tx,
        });
        if (!cancelResult.success) return cancelResult;
      }

      const [updated] = await tx
        .update(userFlow)
        .set({ progressStatus: "withdrawn", updatedAt: new Date() })
        .where(
          and(
            eq(userFlow.id, userFlowId),
            eq(userFlow.progressStatus, "ongoing"),
            sql`not exists (
              select 1
              from ${interviewEvaluation}
              where ${interviewEvaluation.fkUserFlowId} = ${userFlow.id}
                and ${interviewEvaluation.status} = 'submitted'
            )`,
          ),
        )
        .returning({ id: userFlow.id });

      return updated
        ? { success: true as const }
        : {
            success: false as const,
            error: { message: "该面试状态已发生变化，请刷新后重试。" },
          };
    });

    if (!withdrawalResult.success) return withdrawalResult;

    revalidatePath("/dashboard/interviews");
    revalidatePath("/dashboard/user-flow");
    await writeOperationAudit({
      actorId: session.uid,
      actorRole: session.role,
      action: "user_flow.withdraw",
      resourceType: "user_flow",
      resourceId: userFlowId,
      metadata: { scheduleId: candidate.scheduleId ?? null },
    });

    return { success: true };
  } catch (error) {
    logServerError("user-flow:withdraw", error, {
      path: "/dashboard/interviews",
      userId: session?.uid ?? null,
      role: session?.role ?? null,
      action: "withdraw-interview-candidate",
      userFlowId,
    });
    throw error;
  }
}

async function _syncInterviewScheduleFromFeishuEvent(
  input: {
    calendar_event_id?: string;
    change_type?: string;
    internalToken?: string;
  },
) {
  const internalToken = process.env.FEISHU_EVENT_VERIFICATION_TOKEN;
  if (!internalToken || input.internalToken !== internalToken) {
    throw new Error("Unauthorized Feishu calendar event sync");
  }
  const eventId = input.calendar_event_id?.trim();
  if (!eventId) return { synced: false as const, reason: "missing_event_id" as const };

  const [schedule] = await db
    .select({
      id: interviewSchedule.id,
      userFlowId: interviewSchedule.fkUserFlowId,
      organizerId: interviewSchedule.fkOrganizerId,
      providerEventId: interviewSchedule.providerEventId,
      providerCalendarId: interviewSchedule.providerCalendarId,
      attendeeEmail: interviewSchedule.attendeeEmail,
      summary: interviewSchedule.summary,
      description: interviewSchedule.description,
      location: interviewSchedule.location,
      startsAt: interviewSchedule.startsAt,
      endsAt: interviewSchedule.endsAt,
      meetingLink: interviewSchedule.meetingLink,
      scheduleLink: interviewSchedule.scheduleLink,
      status: interviewSchedule.status,
    })
    .from(interviewSchedule)
    .where(
      and(
        eq(interviewSchedule.providerEventId, eventId),
        eq(interviewSchedule.status, "created"),
      ),
    )
    .limit(1);

  if (!schedule) return { synced: false as const, reason: "schedule_not_found" as const };

  const [target] = await db
    .select({
      candidateId: userFlow.fkUserId,
      flowId: flow.id,
      flowTitle: flow.title,
    })
    .from(userFlow)
    .innerJoin(flow, eq(flow.id, userFlow.fkFlowId))
    .where(eq(userFlow.id, schedule.userFlowId))
    .limit(1);
  const userMap = target
    ? await listPeopleUsersByLinkIds([target.candidateId, schedule.organizerId], {
        canViewSensitiveInfo: true,
      })
    : new Map();
  const candidate = target ? userMap.get(target.candidateId) : null;
  const organizer = userMap.get(schedule.organizerId);
  const candidateName = candidate?.name ?? "同学";
  const flowName = target?.flowTitle ?? schedule.summary;
  const organizerName = organizer?.name ?? "面试讲师";

  const sendExternalChangeEmail = async (
    kind: "rescheduled" | "cancelled",
    startsAt: Date,
    endsAt: Date,
    location?: string | null,
  ) => {
    if (!target || !schedule.attendeeEmail) return;
    const emailResult = await sendInterviewEmailDelivery({
      kind,
      toAddress: schedule.attendeeEmail,
      recipientUserId: target.candidateId,
      userFlowId: schedule.userFlowId,
      flowId: target.flowId,
      scheduleId: schedule.id,
      createdBy: schedule.organizerId,
      variables: {
        candidateName,
        flowName,
        organizerName,
        startsAt,
        endsAt,
        location,
      },
    });
    if (!emailResult.ok) {
      logServerError("interviewSchedule:externalChangeEmail", new Error(emailResult.message), {
        action: "send-external-feishu-schedule-change-email",
        metadata: { scheduleId: schedule.id, kind },
      });
    }
  };

  const credential = await getValidFeishuUserCredential(schedule.organizerId);
  let event: Awaited<ReturnType<typeof getFeishuCalendarEvent>>;
  try {
    event = await getFeishuCalendarEvent({
      accessToken: credential.accessToken,
      calendarId: schedule.providerCalendarId,
      eventId,
    });
  } catch (error) {
    if (!isFeishuEventNotFoundError(error)) throw error;
    const [cancelled] = await db
      .update(interviewSchedule)
      .set({ status: "cancelled", updatedAt: new Date() })
      .where(
        and(
          eq(interviewSchedule.id, schedule.id),
          eq(interviewSchedule.status, "created"),
        ),
      )
      .returning({ id: interviewSchedule.id });
    if (!cancelled) return { synced: false as const, reason: "already_cancelled" as const };
    await sendExternalChangeEmail("cancelled", schedule.startsAt, schedule.endsAt, schedule.location);
    revalidatePath("/dashboard/interviews");
    await writeOperationAudit({
      actorId: schedule.organizerId,
      actorType: "provider",
      action: "interview_schedule.sync.cancelled",
      resourceType: "interview_schedule",
      resourceId: schedule.id,
      metadata: { provider: "feishu", providerEventId: eventId, reason: "event_not_found" },
    });
    return { synced: true as const, status: "cancelled" as const };
  }

  if (event.status === "cancelled" || input.change_type === "deleted") {
    const [cancelled] = await db
      .update(interviewSchedule)
      .set({ status: "cancelled", updatedAt: new Date() })
      .where(
        and(
          eq(interviewSchedule.id, schedule.id),
          eq(interviewSchedule.status, "created"),
        ),
      )
      .returning({ id: interviewSchedule.id });
    if (!cancelled) return { synced: false as const, reason: "already_cancelled" as const };
    await sendExternalChangeEmail("cancelled", schedule.startsAt, schedule.endsAt, schedule.location);
    revalidatePath("/dashboard/interviews");
    await writeOperationAudit({
      actorId: schedule.organizerId,
      actorType: "provider",
      action: "interview_schedule.sync.cancelled",
      resourceType: "interview_schedule",
      resourceId: schedule.id,
      metadata: { provider: "feishu", providerEventId: eventId, changeType: input.change_type },
    });
    return { synced: true as const, status: "cancelled" as const };
  }

  const changed =
    event.startsAt.getTime() !== schedule.startsAt.getTime() ||
    event.endsAt.getTime() !== schedule.endsAt.getTime() ||
    (event.location ?? null) !== schedule.location ||
    (event.summary ?? schedule.summary) !== schedule.summary ||
    (event.meetingLink && event.meetingLink !== schedule.meetingLink) ||
    (event.scheduleLink && event.scheduleLink !== schedule.scheduleLink);
  if (!changed) return { synced: false as const, reason: "unchanged" as const };

  await db
    .update(interviewSchedule)
    .set({
      summary: event.summary ?? schedule.summary,
      description: event.description ?? schedule.description,
      location: event.location ?? null,
      startsAt: event.startsAt,
      endsAt: event.endsAt,
      timezone: event.timezone ?? DEFAULT_TIMEZONE,
      meetingLink: event.meetingLink ?? schedule.meetingLink,
      providerMeetingId: event.meetingId,
      providerMeetingNo: event.meetingNo,
      scheduleLink: event.scheduleLink,
      updatedAt: new Date(),
    })
    .where(eq(interviewSchedule.id, schedule.id));
  await sendExternalChangeEmail("rescheduled", event.startsAt, event.endsAt, event.location);
  revalidatePath("/dashboard/interviews");

  await writeOperationAudit({
    actorId: schedule.organizerId,
    actorType: "provider",
    action: "interview_schedule.sync.updated",
    resourceType: "interview_schedule",
    resourceId: schedule.id,
    metadata: {
      provider: "feishu",
      providerEventId: eventId,
      oldStartsAt: schedule.startsAt.toISOString(),
      oldEndsAt: schedule.endsAt.toISOString(),
      startsAt: event.startsAt.toISOString(),
      endsAt: event.endsAt.toISOString(),
      changeType: input.change_type,
    },
  });

  return { synced: true as const, status: "updated" as const };
}

export async function confirmInterviewScheduleEnded(
  scheduleId: number,
): Promise<ConfirmInterviewScheduleEndedResult> {
  const session = await verifyRole(2);
  const [schedule] = await db
    .select({
      id: interviewSchedule.id,
      userFlowId: interviewSchedule.fkUserFlowId,
      organizerId: interviewSchedule.fkOrganizerId,
      startsAt: interviewSchedule.startsAt,
      status: interviewSchedule.status,
      meetingStatus: interviewSchedule.meetingStatus,
    })
    .from(interviewSchedule)
    .where(eq(interviewSchedule.id, scheduleId))
    .limit(1);

  if (!schedule || schedule.status !== "created") {
    return { success: false, error: { message: "该面试日程不可确认结束。" } };
  }
  if (schedule.organizerId !== session.uid) {
    return { success: false, error: { message: "只能由原预约讲师确认面试结束。" } };
  }
  if (schedule.startsAt.getTime() > Date.now()) {
    return { success: false, error: { message: "面试尚未开始，不能确认结束。" } };
  }

  const [updatedSchedule] = await db
    .update(interviewSchedule)
    .set({
      meetingStatus: "ended",
      meetingEndedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(interviewSchedule.id, schedule.id),
        eq(interviewSchedule.meetingStatus, "scheduled"),
      ),
    )
    .returning({ id: interviewSchedule.id });

  if (!updatedSchedule) {
    return { success: false, error: { message: "该面试已经确认结束。" } };
  }

  await writeOperationAudit({
    actorId: session.uid,
    actorRole: session.role,
    action: "interview_schedule.meeting.ended_manual",
    resourceType: "interview_schedule",
    resourceId: schedule.id,
    metadata: { userFlowId: schedule.userFlowId, provider: "feishu" },
  });
  revalidatePath("/dashboard/interviews");

  return { success: true };
}

async function enqueueInterviewScheduleReminder({
  scheduleId,
  startsAt,
  endsAt,
}: {
  scheduleId: number;
  startsAt: Date;
  endsAt: Date;
}) {
  try {
    await mqClient.send({
      name: "interview/schedule.reminder",
      data: {
        scheduleId,
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
      },
      id: `people-interview-reminder-${scheduleId}-${startsAt.getTime()}-${endsAt.getTime()}`,
    });
  } catch (error) {
    logServerError("interviewSchedule:enqueueReminder", error, {
      action: "enqueue-interview-schedule-reminder",
      metadata: { scheduleId },
    });
  }
}
