"use server";

import { db } from "@/db/drizzle";
import { flow, userFlow } from "@/db/schema";
import { verifySession } from "@/lib/dal";
import { logServerError } from "@/lib/server-error-log";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

export const updatePortfolioLink = async (
  userFlowId: number,
  portfolioLink: string,
) => {
  let session: Awaited<ReturnType<typeof verifySession>> | null = null;

  try {
    session = await verifySession();

    const [record] = await db
      .select({
        id: userFlow.id,
        flowType: flow.type,
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

    await db
      .update(userFlow)
      .set({ portfolioLink: portfolioLink.trim() || null })
      .where(eq(userFlow.id, userFlowId));

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
