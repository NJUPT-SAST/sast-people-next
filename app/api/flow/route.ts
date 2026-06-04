import { db } from "@/db/drizzle";
import { and, eq, inArray } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { flow, userFlow, flowStep } from "@/db/schema";
import { verifyRole } from "@/lib/dal";
import { logServerError } from "@/lib/server-error-log";
import { displayUserFlow, computeStatus } from "@/types/userflow";
import { fullStepType } from "@/types/step";

export const GET = async (req: NextRequest) => {
  let session: Awaited<ReturnType<typeof verifyRole>> | null = null;
  const searchParams = req.nextUrl.searchParams;
  const uid = Number(searchParams.get("uid"));

  try {
    session = await verifyRole(3);
    if (!uid) {
      return NextResponse.json({ error: "Invalid uid" }, { status: 400 });
    }
    const raw = await db
      .select()
      .from(userFlow)
      .innerJoin(flow, eq(userFlow.fkFlowId, flow.id))
      .leftJoin(flowStep, eq(flowStep.fkFlowId, userFlow.fkFlowId))
      .where(and(eq(userFlow.fkUserId, uid), eq(flow.isDeleted, false)))
      .orderBy(flowStep.order);

    const currentStepIds = [
      ...new Set(
        raw.map((item) => item.user_flow.fkCurrentStepId).filter(Boolean),
      ),
    ] as number[];
    const currentStepRows =
      currentStepIds.length > 0
        ? await db
            .select({ id: flowStep.id, order: flowStep.order })
            .from(flowStep)
            .where(inArray(flowStep.id, currentStepIds))
        : [];
    const stepOrderMap = new Map(currentStepRows.map((s) => [s.id, s.order]));

    const flowMap = new Map<number, displayUserFlow>();
    raw.forEach((item) => {
      const userFlowId = item.user_flow.id;

      if (!flowMap.has(userFlowId)) {
        flowMap.set(userFlowId, {
          ...item.user_flow,
          status: computeStatus(item.user_flow.progressStatus),
          currentStepOrder: item.user_flow.fkCurrentStepId
            ? (stepOrderMap.get(item.user_flow.fkCurrentStepId) ?? null)
            : null,
          title: item.flow.title,
          flowType: item.flow.type,
          steps: [] as fullStepType[],
        });
      }

      if (item.flow_step) {
        flowMap.get(userFlowId)!.steps.push(item.flow_step as fullStepType);
      }
    });
    return NextResponse.json(
      Array.from(flowMap.values()).map((item) => ({
        ...item,
        steps: item.steps.sort((a, b) => a.order - b.order),
      })),
    );
  } catch (error) {
    logServerError("api:flow:get", error, {
      path: req.nextUrl.pathname,
      method: req.method,
      userId: session?.uid ?? null,
      role: session?.role ?? null,
      action: "get-user-flows-for-manage",
      targetUserId: uid || null,
    });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal error" },
      { status: 500 },
    );
  }
};
