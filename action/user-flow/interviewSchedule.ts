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
  createFeishuMeetingMinute,
  updateFeishuInterviewSchedule,
} from "@/lib/feishu/interview-schedule";
import { sendFeishuTextMessage } from "@/lib/feishu/message";
import { getValidFeishuUserCredential } from "@/lib/feishu/oauth-account";
import { listPeopleUsersByLinkIds } from "@/lib/link/user-lookup";
import { writeOperationAudit } from "@/lib/operation-audit";
import { logServerError } from "@/lib/server-error-log";
import { verifyRole } from "@/lib/dal";
import { sendRawEmail } from "@/queue/sendEmail";
import { and, desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

const DEFAULT_TIMEZONE = "Asia/Shanghai";

type CreateInterviewScheduleInput = {
  userFlowId: number;
  startsAt: string;
  endsAt: string;
  note?: string;
};

type CreateInterviewScheduleResult =
  | {
      success: true;
      data: {
        id: number;
        meetingLink: string;
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

type GenerateMeetingMinuteResult =
  | {
      success: true;
      data: {
        docUrl: string;
      };
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

const formatDateTime = (date: Date) =>
  new Intl.DateTimeFormat("zh-CN", {
    timeZone: DEFAULT_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);

async function notifyOrganizerByFeishu({
  title = "面试日程已创建",
  organizerOpenId,
  candidateName,
  flowName,
  startsAt,
  endsAt,
  meetingLink,
  userFlowId,
  scheduleId,
}: {
  title?: string;
  organizerOpenId: string;
  candidateName: string;
  flowName: string;
  startsAt: Date;
  endsAt: Date;
  meetingLink: string;
  userFlowId: number;
  scheduleId: number;
}) {
  const text = [
    title,
    `流程：${flowName}`,
    `候选人：${candidateName}`,
    `时间：${formatDateTime(startsAt)} - ${formatDateTime(endsAt)}`,
    `会议：${meetingLink}`,
  ].join("\n");

  try {
    await sendFeishuTextMessage({
      openId: organizerOpenId,
      text,
      uuid: `people-interview-schedule-${scheduleId}`,
    });
  } catch (error) {
    logServerError("interviewSchedule:feishuMessage", error, {
      action: "send-interview-schedule-feishu-message",
      userFlowId,
      metadata: {
        scheduleId,
      },
    });
  }
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
      return { success: false, error: { message: "候选人流程不存在" } };
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
    const note = input.note?.trim() || undefined;
    const description = [
      `候选人：${candidateName}`,
      candidate?.studentId ? `学号：${candidate.studentId}` : null,
      note ? `备注：${note}` : null,
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

    const feishuSchedule = existingSchedule
      ? await updateFeishuInterviewSchedule({
          accessToken: credential.accessToken,
          organizerOpenId: credential.openId,
          eventId: existingSchedule.providerEventId as string,
          reserveId: existingSchedule.providerReserveId,
          currentMeetingLink: existingSchedule.meetingLink,
          summary,
          description,
          startsAt,
          endsAt,
          timezone: DEFAULT_TIMEZONE,
        })
      : await createFeishuInterviewSchedule({
          accessToken: credential.accessToken,
          organizerOpenId: credential.openId,
          summary,
          description,
          startsAt,
          endsAt,
          attendeeEmail,
          timezone: DEFAULT_TIMEZONE,
          idempotencyKey: `people-interview-${input.userFlowId}-${startsAt.getTime()}`,
        });

    const [schedule] = existingSchedule
      ? await db
          .update(interviewSchedule)
          .set({
            providerReserveId: feishuSchedule.reserveId,
            providerMeetingNo: feishuSchedule.meetingNo ?? existingSchedule.providerMeetingNo,
            meetingLink: feishuSchedule.meetingLink,
            summary,
            description,
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
            summary,
            description,
            attendeeEmail,
            startsAt,
            endsAt,
            timezone: DEFAULT_TIMEZONE,
            status: "created",
          })
          .returning({ id: interviewSchedule.id });

    const subject = await renderInterviewScheduleEmailSubject(target.flowTitle);
    const html = await renderInterviewScheduleEmail({
      candidateName,
      flowName: target.flowTitle,
      organizerName,
      startsAt,
      endsAt,
      meetingLink: feishuSchedule.meetingLink,
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
      flowName: target.flowTitle,
      startsAt,
      endsAt,
      meetingLink: feishuSchedule.meetingLink,
      userFlowId: input.userFlowId,
      scheduleId: schedule.id,
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

export async function generateInterviewMeetingMinute(
  scheduleId: number,
): Promise<GenerateMeetingMinuteResult> {
  let session: Awaited<ReturnType<typeof verifyRole>> | null = null;

  try {
    session = await verifyRole(2);

    const [schedule] = await db
      .select({
        id: interviewSchedule.id,
        userFlowId: interviewSchedule.fkUserFlowId,
        organizerId: interviewSchedule.fkOrganizerId,
        providerEventId: interviewSchedule.providerEventId,
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
      return { success: false, error: { message: "该预约已经不是可生成妙记的状态。" } };
    }
    if (schedule.organizerId !== session.uid) {
      return { success: false, error: { message: "只能由原预约讲师生成该面试的妙记链接。" } };
    }
    if (!schedule.providerEventId) {
      return { success: false, error: { message: "该预约缺少飞书日程 ID，无法生成妙记。" } };
    }
    if (schedule.endsAt > new Date()) {
      return { success: false, error: { message: "日程结束后才能生成妙记链接。" } };
    }

    const credential = await getValidFeishuUserCredential(session.uid);
    const result = await createFeishuMeetingMinute({
      accessToken: credential.accessToken,
      eventId: schedule.providerEventId,
    });

    await db
      .update(interviewSchedule)
      .set({
        meetingMinuteLink: result.docUrl,
        updatedAt: new Date(),
      })
      .where(eq(interviewSchedule.id, schedule.id));

    await writeOperationAudit({
      actorId: session.uid,
      action: "interview_schedule.meeting_minute.create",
      resourceType: "interview_schedule",
      resourceId: schedule.id,
      metadata: {
        userFlowId: schedule.userFlowId,
        provider: "feishu",
        providerEventId: schedule.providerEventId,
      },
    });

    return {
      success: true,
      data: {
        docUrl: result.docUrl,
      },
    };
  } catch (error) {
    logServerError("interviewSchedule:meetingMinute", error, {
      path: "/dashboard/recruitment",
      userId: session?.uid ?? null,
      role: session?.role ?? null,
      action: "generate-interview-meeting-minute",
      metadata: {
        scheduleId,
      },
    });
    throw error;
  }
}
