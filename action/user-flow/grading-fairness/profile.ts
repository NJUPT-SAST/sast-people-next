"use server";

import "server-only";

import { db } from "@/db/drizzle";
import { flow, gradingFairnessProfile } from "@/db/schema";
import { verifyScopedRole } from "@/lib/authz";
import { assertFlowEditableRecord, isFlowVisibleToScope } from "@/lib/flow-access";
import { MANAGER_ROLE } from "@/lib/link/role";
import { logServerError } from "@/lib/server-error-log";
import type { FlowScopedSession } from "@/action/flow/department-utils";
import { eq, InferSelectModel } from "drizzle-orm";
import { z } from "zod/v4";

import { FairnessProfileValidationError } from "./errors";

/**
 * 阅卷公平性配置（每个流程一行，部长及以上可读可写）：
 * λ 为全局校正强度（0 = 只看不校，1 = 完全按模型校正），
 * judgerWeights 为「阅卷人 ID → 人工权重」的人工覆盖（0..2，未列出的讲师按 1 计）。
 * 配置只影响公平性分析给出的参考分，不写回 user_point，也不影响官方成绩。
 */
export type GradingFairnessProfile = {
  flowId: number;
  lambda: number;
  judgerWeights: Record<string, number>;
  note: string | null;
  updatedAt: string | null;
};

const MAX_NOTE_LENGTH = 500;
const MAX_JUDGER_WEIGHT = 2;

const flowIdSchema = z.number().int().positive("流程 ID 必须是正整数");
const lambdaSchema = z
  .number("校正强度 λ 必须是数字")
  .min(0, "校正强度 λ 必须在 0 到 1 之间")
  .max(1, "校正强度 λ 必须在 0 到 1 之间");
const judgerWeightsSchema = z
  .record(
    z.string(),
    z
      .number("阅卷人权重必须是数字")
      .min(0, `阅卷人权重必须在 0 到 ${MAX_JUDGER_WEIGHT} 之间`)
      .max(MAX_JUDGER_WEIGHT, `阅卷人权重必须在 0 到 ${MAX_JUDGER_WEIGHT} 之间`),
  )
  /* 键即 Link 用户 ID：只接受数字字符串，避免写入无法解析的权重 */
  .superRefine((weights, ctx) => {
    for (const key of Object.keys(weights)) {
      if (!/^\d+$/.test(key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "阅卷人 ID 必须是数字字符串",
          path: [key],
        });
      }
    }
  });
const noteSchema = z
  .string("备注必须是文本")
  .max(MAX_NOTE_LENGTH, `备注不能超过 ${MAX_NOTE_LENGTH} 字`)
  .nullable()
  .optional();

const saveInputSchema = z.object({
  flowId: flowIdSchema,
  lambda: lambdaSchema,
  judgerWeights: judgerWeightsSchema.optional(),
  note: noteSchema,
});

type ProfileRow = InferSelectModel<typeof gradingFairnessProfile>;

/** 未配置的流程一律按「只看不校、无人工权重」的默认配置返回 */
const emptyProfile = (flowId: number): GradingFairnessProfile => ({
  flowId,
  lambda: 0,
  judgerWeights: {},
  note: null,
  updatedAt: null,
});

const toProfile = (row: ProfileRow): GradingFairnessProfile => ({
  flowId: row.fkFlowId,
  lambda: row.lambda,
  judgerWeights: row.judgerWeights ?? {},
  note: row.note ?? null,
  updatedAt: row.updatedAt?.toISOString() ?? null,
});

const firstIssueMessage = (error: z.ZodError, fallback: string): string =>
  error.issues[0]?.message ?? fallback;

const parseFlowId = (flowId: number): number => {
  const parsed = flowIdSchema.safeParse(flowId);
  if (!parsed.success) {
    throw new FairnessProfileValidationError(
      firstIssueMessage(parsed.error, "流程 ID 必须是正整数"),
    );
  }
  return parsed.data;
};

const parseSaveInput = (input: {
  flowId: number;
  lambda: number;
  judgerWeights?: Record<string, number>;
  note?: string | null;
}) => {
  const parsed = saveInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new FairnessProfileValidationError(
      firstIssueMessage(parsed.error, "阅卷公平性配置不合法"),
    );
  }

  const note = parsed.data.note?.trim();

  return {
    flowId: parsed.data.flowId,
    lambda: parsed.data.lambda,
    judgerWeights: parsed.data.judgerWeights ?? {},
    note: note ? note : null,
  };
};

/** 流程归属校验：只有流程归属部门（管理员不限）能读写该流程的公平性配置 */
const resolveEditableFlow = async (
  session: FlowScopedSession,
  flowId: number,
  message: string,
) => {
  const [flowRow] = await db
    .select({ type: flow.type, department: flow.department })
    .from(flow)
    .where(eq(flow.id, flowId))
    .limit(1);

  if (!flowRow) return null;

  assertFlowEditableRecord(session.scope, flowRow, message);
  return flowRow;
};

/** 读取流程的阅卷公平性配置；流程不存在或未配置时返回默认值 */
export const loadGradingFairnessProfile = async (
  flowId: number,
): Promise<GradingFairnessProfile> => {
  let session: FlowScopedSession | null = null;

  try {
    session = await verifyScopedRole(MANAGER_ROLE);
    const targetFlowId = parseFlowId(flowId);

    /* 读路径与 loadGradingFairnessData 用同一套可见性口径：
       全局流程（本部门有报名）能看见分析数据，就必须能读回它的配置；
       写路径仍然要求编辑权限（见 saveGradingFairnessProfile）。 */
    if (!(await isFlowVisibleToScope(session.scope, targetFlowId))) {
      return emptyProfile(targetFlowId);
    }

    const [row] = await db
      .select()
      .from(gradingFairnessProfile)
      .where(eq(gradingFairnessProfile.fkFlowId, targetFlowId))
      .limit(1);

    return row ? toProfile(row) : emptyProfile(targetFlowId);
  } catch (error) {
    /* 入参校验失败属于调用方问题，不作为服务端错误上报 */
    if (error instanceof FairnessProfileValidationError) {
      throw error;
    }

    logServerError("grading-fairness:loadProfile", error, {
      path: "/dashboard/review/fairness",
      action: "load-grading-fairness-profile",
      userId: session?.uid ?? null,
      role: session?.role ?? null,
      flowId,
    });
    throw error;
  }
};

/** 保存流程的阅卷公平性配置（每流程一行，重复保存只更新同一行） */
export const saveGradingFairnessProfile = async (input: {
  flowId: number;
  lambda: number;
  judgerWeights?: Record<string, number>;
  note?: string | null;
}): Promise<GradingFairnessProfile> => {
  let session: FlowScopedSession | null = null;

  try {
    session = await verifyScopedRole(MANAGER_ROLE);
    const values = parseSaveInput(input);

    const flowRow = await resolveEditableFlow(
      session,
      values.flowId,
      "无权修改其他部门的阅卷公平性配置",
    );
    if (!flowRow) {
      throw new FairnessProfileValidationError("流程不存在或已被删除");
    }

    const [row] = await db
      .insert(gradingFairnessProfile)
      .values({
        fkFlowId: values.flowId,
        lambda: values.lambda,
        judgerWeights: values.judgerWeights,
        note: values.note,
        updatedBy: session.uid,
      })
      .onConflictDoUpdate({
        target: gradingFairnessProfile.fkFlowId,
        set: {
          lambda: values.lambda,
          judgerWeights: values.judgerWeights,
          note: values.note,
          updatedBy: session.uid,
        },
      })
      .returning();

    return toProfile(row);
  } catch (error) {
    if (error instanceof FairnessProfileValidationError) {
      throw error;
    }

    logServerError("grading-fairness:saveProfile", error, {
      path: "/dashboard/review/fairness",
      action: "save-grading-fairness-profile",
      userId: session?.uid ?? null,
      role: session?.role ?? null,
      flowId: input?.flowId ?? null,
    });
    throw error;
  }
};
