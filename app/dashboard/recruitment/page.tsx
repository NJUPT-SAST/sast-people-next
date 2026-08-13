import { db } from "@/db/drizzle";
import { flow } from "@/db/schema";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";

export default async function RecruitmentRedirect({
  searchParams,
}: {
  searchParams: Promise<{
    flowId?: string;
    userFlowId?: string;
    scheduleId?: string;
  }>;
}) {
  const params = await searchParams;
  const flowId = Number(params.flowId);
  const [selectedFlow] = Number.isInteger(flowId) && flowId > 0
    ? await db
        .select({ type: flow.type })
        .from(flow)
        .where(eq(flow.id, flowId))
        .limit(1)
    : [];
  const destination = selectedFlow?.type && selectedFlow.type !== "recruitment"
    ? "/dashboard/interviews"
    : "/dashboard/exams";
  const query = new URLSearchParams(
    Object.entries(params).filter(([, value]) => Boolean(value)) as Array<[string, string]>,
  );

  redirect(query.size > 0 ? `${destination}?${query}` : destination);
}
