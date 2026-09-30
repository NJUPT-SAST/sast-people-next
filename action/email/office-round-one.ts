"use server";

import { db } from "@/db/drizzle";
import { flow } from "@/db/schema";
import { verifyManager } from "@/lib/authz";
import type { FlowScopedSession } from "@/action/flow/department-utils";
import { assertFlowEditableRecord } from "@/lib/flow-access";
import { OFFICE_INTERVIEW_FLOW_TYPE } from "@/const/flow";
import { createOfficeRoundOneEmailBatch } from "@/lib/email-center/batch";
import { writeOperationAudit } from "@/lib/operation-audit";
import { logServerError } from "@/lib/server-error-log";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

type SendResult =
  | { success: true; sent: number; passCount: number; rejectCount: number }
  | { success: false; error: { message: string } };

/**
 * 办公类部门面试招新：批量发送一面结果通知（通过 + 未通过）。
 * 与最终结果发布解耦：一面结果不改变报名状态，因此单独走批次发送。
 */
export const sendOfficeRoundOneEmails = async (
  flowId: number,
): Promise<SendResult> => {
  let session: FlowScopedSession | null = null;
  try {
    session = await verifyManager();
    const [flowRow] = await db
      .select({
        id: flow.id,
        title: flow.title,
        type: flow.type,
        department: flow.department,
      })
      .from(flow)
      .where(eq(flow.id, flowId))
      .limit(1);

    if (!flowRow) {
      return { success: false, error: { message: "流程不存在" } };
    }
    assertFlowEditableRecord(session.scope, flowRow);
    if (flowRow.type !== OFFICE_INTERVIEW_FLOW_TYPE) {
      return {
        success: false,
        error: { message: "只有办公类部门面试招新支持发送一面结果通知" },
      };
    }

    const [accepted, rejected] = await Promise.all([
      createOfficeRoundOneEmailBatch({
        flowId,
        createdBy: session.uid,
        accept: true,
      }),
      createOfficeRoundOneEmailBatch({
        flowId,
        createdBy: session.uid,
        accept: false,
      }),
    ]);
    const passCount = accepted?.recipientCount ?? 0;
    const rejectCount = rejected?.recipientCount ?? 0;
    if (passCount === 0 && rejectCount === 0) {
      return {
        success: false,
        error: {
          message:
            "暂无可发送的一面结果通知（需要先在面试管理中完成一面审批，且邮件未发送过）",
        },
      };
    }

    await writeOperationAudit({
      actorId: session.uid,
      actorRole: session.role,
      action: "email.batch_send",
      resourceType: "email_batch",
      resourceId: accepted?.batchId ?? rejected?.batchId ?? null,
      department: null,
      metadata: {
        flowId,
        round: 1,
        kind: "office_round1",
        passCount,
        rejectCount,
      },
    });
    revalidatePath("/dashboard/interviews");
    revalidatePath("/dashboard/emails");
    return {
      success: true,
      sent: passCount + rejectCount,
      passCount,
      rejectCount,
    };
  } catch (error) {
    logServerError("email:office-round-one", error, {
      path: "/dashboard/interviews",
      userId: session?.uid ?? null,
      role: session?.role ?? null,
      action: "send-office-round-one-emails",
      flowId,
    });
    throw error;
  }
};
