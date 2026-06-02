import { NextRequest, NextResponse } from 'next/server';
import {
  ReviewPointConflictError,
  batchUpsertPoint,
  upsertPoint,
} from '@/action/user-flow/user-point/upsert';
import { logServerError } from '@/lib/server-error-log';
import { z } from 'zod';

const pointValueSchema = z.object({
  id: z.number().int().optional(),
  fkUserFlowId: z.number().int().positive(),
  fkProblemId: z.number().int().positive(),
  points: z.number().int().min(0),
  fkJudgerId: z.number().int().nullable().optional(),
});

const batchPointSchema = z.array(pointValueSchema).min(1, '评分列表不能为空').superRefine((values, ctx) => {
  const expectedUserFlowId = values[0]?.fkUserFlowId;
  const problemIds = new Set<number>();

  values.forEach((value, index) => {
    if (value.fkUserFlowId !== expectedUserFlowId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: '一次提交只能保存同一位考生的评分',
        path: [index, 'fkUserFlowId'],
      });
    }

    if (problemIds.has(value.fkProblemId)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: '一次提交不能包含重复题目',
        path: [index, 'fkProblemId'],
      });
    }

    problemIds.add(value.fkProblemId);
  });
});

const singlePointSchema = z.object({
  userFlowId: z.number().int().positive(),
  problemId: z.number().int().positive(),
  point: z.number().int().min(0),
});

function getValidationMessage(error: z.ZodError) {
  return error.issues[0]?.message ?? '评分参数无效';
}

export async function POST(request: NextRequest) {
  let body: { action?: string; data?: unknown } | null = null;
  try {
    body = await request.json();
    const { action, data } = body ?? {};

    if (action === 'batch') {
      const parsed = batchPointSchema.safeParse(data);
      if (!parsed.success) {
        return NextResponse.json(
          { success: false, message: getValidationMessage(parsed.error) },
          { status: 400 },
        );
      }
      const values = parsed.data;
      await batchUpsertPoint(values);
      return NextResponse.json({ success: true, message: '批量更新成功' });
    } else if (action === 'single') {
      const parsed = singlePointSchema.safeParse(data);
      if (!parsed.success) {
        return NextResponse.json(
          { success: false, message: getValidationMessage(parsed.error) },
          { status: 400 },
        );
      }
      const { userFlowId, problemId, point } = parsed.data;
      await upsertPoint(userFlowId, problemId, point);
      return NextResponse.json({ success: true, message: '更新成功' });
    } else {
      return NextResponse.json({ success: false, message: '无效的操作类型' }, { status: 400 });
    }
  } catch (error) {
    if (error instanceof ReviewPointConflictError) {
      return NextResponse.json(
        { success: false, message: error.message },
        { status: 409 },
      );
    }

    const data = body?.data;
    const firstPoint = Array.isArray(data) ? data[0] : data;
    logServerError('api:user-point:post', error, {
      path: request.nextUrl.pathname,
      method: request.method,
      action: body?.action,
      userFlowId:
        typeof firstPoint === 'object' && firstPoint !== null && 'userFlowId' in firstPoint
          ? Number(firstPoint.userFlowId)
          : typeof firstPoint === 'object' && firstPoint !== null && 'fkUserFlowId' in firstPoint
            ? Number(firstPoint.fkUserFlowId)
            : null,
      metadata: {
        itemCount: Array.isArray(data) ? data.length : data ? 1 : 0,
      },
    });
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : '操作失败' },
      { status: 500 }
    );
  }
}
