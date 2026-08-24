"use server";

import { db } from "@/db/drizzle";
import { flow, userFlow } from "@/db/schema";
import { verifySession } from "@/lib/dal";
import { logServerError } from "@/lib/server-error-log";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { isValidExternalUrl } from "@/lib/link";
import { writeOperationAudit } from "@/lib/operation-audit";

const editableStatuses = new Set(["not_started", "ongoing"]);

export const updatePortfolioLink = async (
  userFlowId: number,
  portfolioLink: string,
  portfolioDescription: string,
) => {
  let session: Awaited<ReturnType<typeof verifySession>> | null = null;

  try {
    session = await verifySession();

    const [record] = await db
      .select({
        id: userFlow.id,
        flowId: userFlow.fkFlowId,
        flowType: flow.type,
        progressStatus: userFlow.progressStatus,
      })
      .from(userFlow)
      .innerJoin(flow, eq(userFlow.fkFlowId, flow.id))
      .where(
        and(
          eq(userFlow.id, userFlowId),
          eq(userFlow.fkUserId, session.uid),
          eq(flow.isDeleted, false),
        ),
      )
      .limit(1);

    if (!record) {
      return { success: false, error: { message: "报名记录不存在" } };
    }

    if (record.flowType === "recruitment") {
      return { success: false, error: { message: "当前流程不需要作品链接" } };
    }

    if (!record.progressStatus || !editableStatuses.has(record.progressStatus)) {
      return {
        success: false,
        error: { message: "流程已结束，作品链接不可修改" },
      };
    }

    if (portfolioLink.trim() && !isValidExternalUrl(portfolioLink)) {
      return {
        success: false,
        error: { message: "作品链接格式不正确，请填写有效的 URL" },
      };
    }

    await db
      .update(userFlow)
      .set({
        portfolioLink: portfolioLink.trim() || null,
        portfolioDescription: portfolioDescription.trim() || null,
      })
      .where(eq(userFlow.id, userFlowId));

    await writeOperationAudit({
      actorId: session.uid,
      actorRole: session.role,
      action: "user_flow.portfolio.update",
      resourceType: "user_flow",
      resourceId: userFlowId,
      metadata: {
        flowId: record.flowId,
        targetUserId: session.uid,
        hasPortfolioLink: Boolean(portfolioLink.trim()),
        hasPortfolioDescription: Boolean(portfolioDescription.trim()),
      },
    });

    revalidatePath("/dashboard/user-flow");
    return { success: true };
  } catch (error) {
    logServerError("user-flow:updatePortfolioLink", error, {
      path: "/dashboard/user-flow",
      action: "update-portfolio-link",
      userId: session?.uid ?? null,
      userFlowId,
      metadata: { hasPortfolioLink: Boolean(portfolioLink.trim()) },
    });
    throw error;
  }
};
