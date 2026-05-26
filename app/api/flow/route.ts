import { db } from "@/db/drizzle";
import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { flow, userFlow, flowStep } from "@/db/schema";
import { verifyRole } from "@/lib/dal";
import { displayUserFlow } from "@/types/userflow";
import { fullStepType } from "@/types/step";

export const GET = async (req: NextRequest) => {
  await verifyRole(3);
  const searchParams = req.nextUrl.searchParams;
  const uid = Number(searchParams.get("uid"));
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
  const flowMap = new Map<number, displayUserFlow>();
  raw.forEach((item) => {
    const userFlowId = item.user_flow.id;

    if (!flowMap.has(userFlowId)) {
      flowMap.set(userFlowId, {
        ...item.user_flow,
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
};
