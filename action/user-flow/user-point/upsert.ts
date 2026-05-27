import { db } from "@/db/drizzle";
import { userPoint } from "@/db/schema";
import { verifyRole } from "@/lib/dal";
import { logServerError } from "@/lib/server-error-log";
import { InferInsertModel, sql } from "drizzle-orm";

export const upsertPoint = async (userFlowId: number, problemId: number, point: number) => {
  let session: Awaited<ReturnType<typeof verifyRole>> | null = null;

  try {
    session = await verifyRole(2);
    await db.insert(userPoint).values({
      fkUserFlowId: userFlowId,
      fkProblemId: problemId,
      points: point,
      fkJudgerId: session!.uid,
    }).onConflictDoUpdate({
      target: [userPoint.fkUserFlowId, userPoint.fkProblemId],
      set: {
        points: point,
        fkJudgerId: session!.uid,
      },
    });
  } catch (error) {
    logServerError("review:upsertPoint", error, {
      path: "/dashboard/review/marking",
      action: "upsert-point",
      userId: session?.uid ?? null,
      role: session?.role ?? null,
      userFlowId,
      metadata: { problemId, point },
    });
    throw error;
  }

};

export const batchUpsertPoint = async (values: Array<InferInsertModel<typeof userPoint>>) => {
  let session: Awaited<ReturnType<typeof verifyRole>> | null = null;

  try {
    session = await verifyRole(2);
    // ignore id here to avoid (conflict but not exist)
    await db.insert(userPoint).values(values.map(value => ({
      fkUserFlowId: value.fkUserFlowId,
      fkProblemId: value.fkProblemId,
      points: value.points,
      fkJudgerId: session!.uid,
    }))).onConflictDoUpdate({
      target: [userPoint.fkUserFlowId, userPoint.fkProblemId],
      set: {
        points: sql`excluded.points`,
        fkJudgerId: sql`excluded.fk_judger_id`,
      },
    });
  } catch (error) {
    logServerError("review:batchUpsertPoint", error, {
      path: "/dashboard/review/marking",
      action: "batch-upsert-point",
      userId: session?.uid ?? null,
      role: session?.role ?? null,
      userFlowId: values[0]?.fkUserFlowId ?? null,
      metadata: {
        itemCount: values.length,
        problemIds: values.map((value) => value.fkProblemId),
      },
    });
    throw error;
  }

};
