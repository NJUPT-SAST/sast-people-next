"use server";

import { db } from "@/db/drizzle";
import {
  flow,
  interviewEvaluation,
  interviewSchedule,
  userFlow,
} from "@/db/schema";
import {
  renderInterviewScheduleEmail,
  renderInterviewScheduleEmailSubject,
} from "@/lib/email/interview-schedule";
import { getEducationEmail } from "@/lib/email/address";
import { createFeishuInterviewSchedule } from "@/lib/feishu/interview-schedule";
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

function parseDate(value: string, fieldName: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`${fieldName} 时间格式不正确`);
  }
  return date;
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
    const feishuSchedule = await createFeishuInterviewSchedule({
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

    const [existingEvaluation] = await db
      .select({ id: interviewEvaluation.id })
      .from(interviewEvaluation)
      .where(
        and(
          eq(interviewEvaluation.fkUserFlowId, input.userFlowId),
          eq(interviewEvaluation.status, "submitted"),
        ),
      )
      .orderBy(desc(interviewEvaluation.createdAt))
      .limit(1);

    const [schedule] = await db.transaction(async (tx) => {
      if (existingEvaluation) {
        await tx
          .update(interviewEvaluation)
          .set({
            meetingLink: feishuSchedule.meetingLink,
            updatedAt: new Date(),
          })
          .where(eq(interviewEvaluation.id, existingEvaluation.id));
      }

      return tx
        .insert(interviewSchedule)
        .values({
          fkUserFlowId: input.userFlowId,
          fkEvaluationId: existingEvaluation?.id ?? null,
          fkOrganizerId: session!.uid,
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
    });

    const subject = renderInterviewScheduleEmailSubject(target.flowTitle);
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

    revalidatePath("/dashboard/recruitment");
    await writeOperationAudit({
      actorId: session.uid,
      action: "interview_schedule.create",
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
