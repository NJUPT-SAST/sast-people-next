import { NextRequest, NextResponse } from 'next/server';
import { batchUpsertPoint, upsertPoint } from '@/action/user-flow/user-point/upsert';
import { userPoint } from '@/db/schema';
import { InferInsertModel } from 'drizzle-orm';
import { logServerError } from '@/lib/server-error-log';

export async function POST(request: NextRequest) {
  let body: { action?: string; data?: unknown } | null = null;
  try {
    body = await request.json();
    const { action, data } = body ?? {};

    if (action === 'batch') {
      const values = data as Array<InferInsertModel<typeof userPoint>>;
      await batchUpsertPoint(values);
      return NextResponse.json({ success: true, message: '批量更新成功' });
    } else if (action === 'single') {
      const { userFlowId, problemId, point } = data as {
        userFlowId: number;
        problemId: number;
        point: number;
      };
      await upsertPoint(userFlowId, problemId, point);
      return NextResponse.json({ success: true, message: '更新成功' });
    } else {
      return NextResponse.json({ success: false, message: '无效的操作类型' }, { status: 400 });
    }
  } catch (error) {
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
