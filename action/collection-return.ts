"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod/v4";
import { db } from "@/db/drizzle";
import { collectionSubmission } from "@/db/schema";
import { getPublicBaseUrl } from "@/lib/app-url";
import {
  getCollectionFormById,
  getCollectionSubmissionById,
} from "@/lib/collection";
import { canManageCollectionForm } from "@/lib/collection-access";
import { collectionFormPhase } from "@/lib/collection-status";
import { buildCollectionReturnEmail } from "@/lib/collection/invitation-email";
import { verifySession } from "@/lib/dal";
import {
  createEmailDelivery,
  sendEmailDelivery,
} from "@/lib/email-center/delivery";
import { listPeopleUsersByLinkIds } from "@/lib/link/user-lookup";
import { writeOperationAudit } from "@/lib/operation-audit";
import { logServerError } from "@/lib/server-error-log";
import { formatBeijingDateTime } from "@/lib/timezone";

const returnInputSchema = z.object({
  formId: z.number().int().positive(),
  submissionId: z.number().int().positive(),
  note: z.string().trim().max(500).optional(),
});

type ActionResult<T = undefined> =
  | { success: true; data?: T }
  | { success: false; message: string };

const failure = (message: string): { success: false; message: string } => ({
  success: false,
  message,
});

/**
 * 部长及以上退回一条填写：记录退回说明并通知填写人修改。
 * 填写人重新提交后，退回标记会自动清除。
 */
export async function returnCollectionSubmission(input: {
  formId: number;
  submissionId: number;
  note?: string;
}): Promise<ActionResult<{ emailed: boolean }>> {
  const session = await verifySession();
  if (!canManageCollectionForm(session)) {
    return failure("仅部长及以上可退回填写");
  }

  const parsed = returnInputSchema.safeParse(input);
  if (!parsed.success) {
    return failure(parsed.error.issues[0]?.message ?? "退回参数无效");
  }

  const form = await getCollectionFormById(parsed.data.formId);
  if (!form) return failure("收集表不存在");
  if (collectionFormPhase(form) !== "open") {
    return failure("仅在收集期间可以退回填写");
  }

  const submission = await getCollectionSubmissionById(
    form.id,
    parsed.data.submissionId,
  );
  if (!submission) return failure("填写记录不存在");

  const note = parsed.data.note?.trim() || null;
  const returnedAt = new Date();

  await db
    .update(collectionSubmission)
    .set({ returnedAt, returnNote: note, updatedAt: new Date() })
    .where(
      eq(collectionSubmission.id, submission.id),
    );

  let emailed = false;
  const recipient = (
    await listPeopleUsersByLinkIds([submission.fkUserId]).catch(
      () => new Map(),
    )
  ).get(submission.fkUserId);
  const emailAddress = recipient?.email ?? null;

  if (emailAddress) {
    const email = buildCollectionReturnEmail({
      name: recipient?.name ?? "",
      formTitle: form.title,
      deadlineLabel: form.deadline
        ? formatBeijingDateTime(form.deadline)
        : null,
      url: `${getPublicBaseUrl()}/collect/${form.shareToken}`,
      note,
    });

    try {
      const { deliveryId } = await createEmailDelivery({
        category: "collection",
        templateKey: "collection.return",
        toAddress: emailAddress,
        subject: email.subject,
        htmlSnapshot: email.html,
        recipientUserId: submission.fkUserId,
        createdBy: session.uid,
        metadata: { formId: form.id, submissionId: submission.id },
      });
      await sendEmailDelivery(deliveryId, {
        trigger: "immediate",
        triggeredBy: session.uid,
      });
      emailed = true;
    } catch (error) {
      logServerError("collection:submission:return-email", error, {
        path: `/dashboard/collection/${form.id}`,
        userId: session.uid,
        role: session.role,
        action: "return-collection-submission",
        metadata: { formId: form.id, submissionId: submission.id },
      });
    }
  }

  await writeOperationAudit({
    actorId: session.uid,
    actorRole: session.realRole,
    action: "collection.submission.return",
    resourceType: "collection_submission",
    resourceId: submission.id,
    metadata: {
      formId: form.id,
      note,
      emailed,
    },
  });

  revalidatePath("/dashboard/collection");
  revalidatePath(`/dashboard/collection/${form.id}`);
  return { success: true, data: { emailed } };
}
