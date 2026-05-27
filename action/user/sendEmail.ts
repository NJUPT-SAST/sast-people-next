"use server";
import { db } from "@/db/drizzle";
import { emailBatch, emailDelivery, flow, user, userFlow } from "@/db/schema";
import { verifyRole } from "@/lib/dal";
import { getEducationEmail } from "@/lib/email/address";
import {
  getResultEmailTemplateKey,
  renderResultEmailSubject,
  renderResultEmail,
} from "@/lib/email/result-email";
import { getEmailTemplateSetting } from "@/action/email/template";
import { logServerError } from "@/lib/server-error-log";
import { and, eq, inArray } from "drizzle-orm";

export const batchSendEmail = async (
  uid: number[],
  flowId: number,
  accept: boolean
) => {
  let session: Awaited<ReturnType<typeof verifyRole>> | null = null;

  try {
    session = await verifyRole(3)
    const sourceStatus = accept ? "passed" : "failed";

    const targets = (
      await db
        .select({
          userFlowId: userFlow.id,
          userId: user.id,
          studentId: user.studentId,
          name: user.name,
          flowName: flow.title,
        })
        .from(userFlow)
        .innerJoin(user, eq(user.id, userFlow.fkUserId))
        .innerJoin(flow, eq(flow.id, userFlow.fkFlowId))
        .where(
          and(
            eq(userFlow.fkFlowId, flowId),
            inArray(userFlow.fkUserId, uid),
            eq(userFlow.status, sourceStatus),
          )
        )
    );

    if (targets.length === 0) {
      return { batchId: null, deliveryCount: 0 };
    }

    const templateKey = getResultEmailTemplateKey(accept);
    const templateSetting = await getEmailTemplateSetting(templateKey);
    const subject = renderResultEmailSubject(targets[0].flowName, templateSetting);
    const [batch] = await db
      .insert(emailBatch)
      .values({
        templateKey,
        subject,
        accept,
        status: "draft",
        totalCount: targets.length,
        fkFlowId: flowId,
        fkCreatedBy: session.uid,
      })
      .returning({ id: emailBatch.id });

    const deliveries = await Promise.all(
      targets.map(async (item) => {
        const toAddress = getEducationEmail(item.studentId);
        const htmlSnapshot = await renderResultEmail({
          name: item.name,
          flowName: item.flowName,
          accept,
          setting: templateSetting,
        });

        const [delivery] = await db
          .insert(emailDelivery)
          .values({
            toAddress,
            subject,
            htmlSnapshot,
            fkEmailBatchId: batch.id,
            fkUserFlowId: item.userFlowId,
            fkUserId: item.userId,
          })
          .returning({ id: emailDelivery.id });

        return delivery;
      }),
    );

    return { batchId: batch.id, deliveryCount: deliveries.length };
  } catch (error) {
    logServerError("email:batchSend", error, {
      path: "/dashboard/review",
      userId: session?.uid ?? null,
      role: session?.role ?? null,
      action: accept ? "send-acceptance-email" : "send-rejection-email",
      flowId,
      metadata: {
        targetUserIds: uid,
        accept,
      },
    });
    throw error;
  }
};
