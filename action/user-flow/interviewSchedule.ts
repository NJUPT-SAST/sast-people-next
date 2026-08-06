"use server";

import { db } from "@/db/drizzle";
import {
  flow,
  interviewSchedule,
  userFlow,
} from "@/db/schema";
import { createRenderedEmailDelivery } from "@/lib/email-center/delivery";
import { renderEmailTemplate } from "@/lib/email-center/render";
import { getEducationEmail } from "@/lib/email/address";
import {
  cancelFeishuInterviewSchedule,
  createFeishuInterviewSchedule,
  isFeishuEventNotFoundError,
  isFeishuInternalServiceError,
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
import { and, desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

const DEFAULT_TIMEZONE = "Asia/Shanghai";
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
  const location = input.location?.trim() || undefined;
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
    const location = input.location?.trim() || undefined;
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

    let feishuSchedule: Awaited<ReturnType<typeof createFeishuInterviewSchedule>>;
    if (existingSchedule) {
      try {
        feishuSchedule = await updateFeishuInterviewSchedule({
          accessToken: credential.accessToken,
          organizerOpenId: credential.openId,
          eventId: existingSchedule.providerEventId as string,
          reserveId: existingSchedule.providerReserveId,
          currentMeetingLink: existingSchedule.meetingLink,
          summary,
          description,
          location,
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
          summary,
          description,
          location,
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
        summary,
        description,
        location,
        startsAt,
        endsAt,
        timezone: DEFAULT_TIMEZONE,
        idempotencyKey: `people-interview-${input.userFlowId}-${startsAt.getTime()}-${endsAt.getTime()}`,
      });
    }

    const [schedule] = existingSchedule
      ? await db
          .update(interviewSchedule)
          .set({
            providerEventId: feishuSchedule.eventId,
            providerReserveId: feishuSchedule.reserveId,
            providerMeetingId:
              feishuSchedule.meetingId ?? existingSchedule.providerMeetingId,
            providerMeetingNo: feishuSchedule.meetingNo ?? existingSchedule.providerMeetingNo,
            meetingLink: feishuSchedule.meetingLink,
            scheduleLink: feishuSchedule.scheduleLink,
            summary,
            description,
            location: location ?? null,
            attendeeEmail,
            startsAt,
            endsAt,
            timezone: DEFAULT_TIMEZONE,
            updatedAt: new Date(),
          })
          .where(eq(interviewSchedule.id, existingSchedule.id))
          .returning({ id: interviewSchedule.id })
      : await db
          .insert(interviewSchedule)
          .values({
            fkUserFlowId: input.userFlowId,
            fkOrganizerId: session.uid,
            providerEventId: feishuSchedule.eventId,
            providerReserveId: feishuSchedule.reserveId,
            providerMeetingId: feishuSchedule.meetingId,
            providerMeetingNo: feishuSchedule.meetingNo,
            meetingLink: feishuSchedule.meetingLink,
            scheduleLink: feishuSchedule.scheduleLink,
            summary,
            description,
            location: location ?? null,
            attendeeEmail,
            startsAt,
            endsAt,
            timezone: DEFAULT_TIMEZONE,
            status: "created",
          })
          .returning({ id: interviewSchedule.id });

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

    revalidatePath("/dashboard/recruitment");
    await writeOperationAudit({
      actorId: session.uid,
      action: existingSchedule ? "interview_schedule.update" : "interview_schedule.create",
      resourceType: "interview_schedule",
      resourceId: schedule.id,
      metadata: {
        userFlowId: input.userFlowId,
        flowId: target.flowId,
        provider: "feishu",
        providerEventId: feishuSchedule.eventId,
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
      path: "/dashboard/recruitment",
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
): Promise<CancelInterviewScheduleResult> {
  let session: Awaited<ReturnType<typeof verifyRole>> | null = null;

  try {
    session = await verifyRole(2);

    const [schedule] = await db
      .select({
        id: interviewSchedule.id,
        userFlowId: interviewSchedule.fkUserFlowId,
        organizerId: interviewSchedule.fkOrganizerId,
        providerEventId: interviewSchedule.providerEventId,
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
    if (schedule.organizerId !== session.uid) {
      return { success: false, error: { message: "只能由原预约讲师取消该面试。" } };
    }

    const credential = await getValidFeishuUserCredential(session.uid);
    await cancelFeishuInterviewSchedule({
      accessToken: credential.accessToken,
      eventId: schedule.providerEventId,
      reserveId: schedule.providerReserveId,
    });

    await db
      .update(interviewSchedule)
      .set({
        status: "cancelled",
        updatedAt: new Date(),
      })
      .where(eq(interviewSchedule.id, schedule.id));

    const [target] = await db
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
      ? await listPeopleUsersByLinkIds([target.candidateId, session.uid], {
          canViewSensitiveInfo: true,
        })
      : new Map();
    const candidate = target ? userMap.get(target.candidateId) : null;
    const organizer = userMap.get(session.uid);
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

    await sendInterviewCancelledCard({
      openId: credential.openId,
      flowName,
      candidateName,
      startsAt: schedule.startsAt,
      endsAt: schedule.endsAt,
      location: schedule.location,
      scheduleId: schedule.id,
    });
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

    revalidatePath("/dashboard/recruitment");
    await writeOperationAudit({
      actorId: session.uid,
      action: "interview_schedule.cancel",
      resourceType: "interview_schedule",
      resourceId: schedule.id,
      metadata: {
        userFlowId: schedule.userFlowId,
        provider: "feishu",
        providerEventId: schedule.providerEventId,
      },
    });

    return { success: true, emailWarning };
  } catch (error) {
    logServerError("interviewSchedule:cancel", error, {
      path: "/dashboard/recruitment",
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
    action: "interview_schedule.meeting.ended_manual",
    resourceType: "interview_schedule",
    resourceId: schedule.id,
    metadata: { userFlowId: schedule.userFlowId, provider: "feishu" },
  });
  revalidatePath("/dashboard/recruitment");

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
