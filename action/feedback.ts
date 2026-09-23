"use server";

import { desc, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod/v4";
import { db } from "@/db/drizzle";
import { feedbackReport } from "@/db/schema";
import { verifyRole } from "@/lib/dal";
import { writeOperationAudit } from "@/lib/operation-audit";

const statusSchema = z.enum(["pending", "in_progress", "resolved"]);
const reportIdSchema = z.number().int().positive();
const resolutionNoteSchema = z.string().max(10000);

export async function listFeedbackReports(status = "all") {
  await verifyRole(3);
  const filter = status === "all" ? undefined : statusSchema.parse(status);
  return db
    .select()
    .from(feedbackReport)
    .where(filter ? eq(feedbackReport.status, filter) : undefined)
    .orderBy(
      sql`case when ${feedbackReport.status} = 'pending' then 0 when ${feedbackReport.status} = 'in_progress' then 1 else 2 end`,
      desc(feedbackReport.createdAt),
    );
}

export async function updateFeedbackReport(
  id: number,
  status: "pending" | "in_progress" | "resolved",
  resolutionNote?: string,
) {
  const session = await verifyRole(3);
  const reportId = reportIdSchema.parse(id);
  const validatedStatus = statusSchema.parse(status);
  const note = resolutionNote === undefined
    ? undefined
    : resolutionNoteSchema.parse(resolutionNote).trim() || null;
  const [updated] = await db
    .update(feedbackReport)
    .set({
      status: validatedStatus,
      ...(note !== undefined ? { resolutionNote: note } : {}),
      resolvedBy: validatedStatus === "resolved" ? session.uid : null,
      resolvedAt: validatedStatus === "resolved" ? new Date() : null,
    })
    .where(eq(feedbackReport.id, reportId))
    .returning({
      id: feedbackReport.id,
      resolvedBy: feedbackReport.resolvedBy,
      resolvedAt: feedbackReport.resolvedAt,
      resolutionNote: feedbackReport.resolutionNote,
    });
  if (!updated) throw new Error("反馈记录不存在");

  await writeOperationAudit({
    actorId: session.uid,
    actorRole: session.role,
    action: "feedback.status.update",
    resourceType: "feedback_report",
    resourceId: id,
    metadata: { status: validatedStatus, hasResolutionNote: Boolean(note) },
  });
  revalidatePath("/dashboard/feedback");
  return updated;
}

export async function updateFeedbackResolutionNote(id: number, resolutionNote: string) {
  await verifyRole(3);
  const reportId = reportIdSchema.parse(id);
  const note = resolutionNoteSchema.parse(resolutionNote).trim() || null;
  const [updated] = await db
    .update(feedbackReport)
    .set({ resolutionNote: note })
    .where(eq(feedbackReport.id, reportId))
    .returning({ id: feedbackReport.id, resolutionNote: feedbackReport.resolutionNote });
  if (!updated) throw new Error("反馈记录不存在");
  revalidatePath("/dashboard/feedback");
  return updated;
}
