"use server";

import { db } from "@/db/drizzle";
import {
  flow,
  interviewSchedule,
  userFlow,
} from "@/db/schema";
import {
  renderInterviewScheduleEmail,
  renderInterviewScheduleEmailSubject,
} from "@/lib/email/interview-schedule";
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
import { sendRawEmail } from "@/queue/sendEmail";
import { and, desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

const DEFAULT_TIMEZONE = "Asia/Shanghai";

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
    }
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

async function notifyOrganizerByFeishu({
  title = "面试日程已创建",
  organizerOpenId,
  candidateName,
  candidatePhone,
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
  candidatePhone?: string | null;
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
      candidatePhone,
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
  const subject = await renderInterviewScheduleEmailSubject(target.flowTitle, kind);
  const html = await renderInterviewScheduleEmail({
    kind,
    candidateName,
    flowName: target.flowTitle,
    organizerName,
    startsAt,
    endsAt,
    location,
    meetingLink: "https://vc.feishu.cn/j/123456789",
    scheduleLink: "https://applink.feishu.cn/client/calendar/event/detail?calendarId=primary&eventId=demo",
    note,
  });

  return {
    success: true,
    data: {
      subject,
      to: attendeeEmail,
      html,
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
    const summary = `${target.flowTitle} 面试 - ${candidateName}`;
    const location = input.location?.trim() || undefined;
    const note = input.note?.trim() || undefined;
    const description = [
      `面试同学：${candidateName}`,
      candidate?.studentId ? `学号：${candidate.studentId}` : null,
      candidate?.phone ? `手机号：${candidate.phone}` : null,
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
          idempotencyKey: `people-interview-${input.userFlowId}-${startsAt.getTime()}-recreate-${Date.now()}`,
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
        idempotencyKey: `people-interview-${input.userFlowId}-${startsAt.getTime()}-${Date.now()}`,
      });
    }

    const [schedule] = existingSchedule
      ? await db
          .update(interviewSchedule)
          .set({
            providerEventId: feishuSchedule.eventId,
            providerReserveId: feishuSchedule.reserveId,
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
    const subject = await renderInterviewScheduleEmailSubject(target.flowTitle, emailKind);
    const html = await renderInterviewScheduleEmail({
      kind: emailKind,
      candidateName,
      flowName: target.flowTitle,
      organizerName,
      startsAt,
      endsAt,
      location,
      meetingLink: feishuSchedule.meetingLink,
      scheduleLink: feishuSchedule.scheduleLink,
      note,
    });
    await sendRawEmail({
      to: attendeeEmail,
      subject,
      html,
    });

    await notifyOrganizerByFeishu({
      title: existingSchedule ? "面试日程已改约" : "面试日程已创建",
      organizerOpenId: credential.openId,
      candidateName,
      candidatePhone: candidate?.phone ?? null,
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
      title: existingSchedule ? "面试日程已改约" : "面试日程已创建",
      candidateName,
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
    if (schedule.attendeeEmail) {
      const subject = await renderInterviewScheduleEmailSubject(flowName, "cancelled");
      const html = await renderInterviewScheduleEmail({
        kind: "cancelled",
        candidateName,
        flowName,
        organizerName,
        startsAt: schedule.startsAt,
        endsAt: schedule.endsAt,
        location: schedule.location,
        meetingLink: "",
      });
      await sendRawEmail({
        to: schedule.attendeeEmail,
        subject,
        html,
      });
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

    return { success: true };
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
