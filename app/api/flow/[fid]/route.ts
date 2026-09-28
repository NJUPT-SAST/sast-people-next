// import { backward, forward } from '@/action/user-flow/edit';
import { useFlowStepsInfo as getFlowStepsInfo } from '@/hooks/useFlowStepsInfo';
import { db } from '@/db/drizzle';
import { flow } from '@/db/schema';
import { verifyManager } from '@/lib/authz';
import type { FlowScopedSession } from '@/action/flow/department-utils';
import { logServerError } from '@/lib/server-error-log';
import { and, eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';

export const GET = async (
  req: NextRequest,
  context: { params: Promise<{ fid: string }> },
) => {
  const { fid } = await context.params;
  const flowId = Number(fid);
  let session: FlowScopedSession | null = null;

  try {
    session = await verifyManager();
    if (!Number.isInteger(flowId) || flowId <= 0) {
      return NextResponse.json({ error: 'Invalid flow id' }, { status: 400 });
    }

    /* 流程列表对部长及以上全局可见；编辑权限由写路径的 assertFlowEditable 控制 */
    const [existingFlow] = await db
      .select({ id: flow.id })
      .from(flow)
      .where(and(eq(flow.id, flowId), eq(flow.isDeleted, false)))
      .limit(1);
    if (!existingFlow) {
      return NextResponse.json({ error: '流程不存在' }, { status: 404 });
    }

    return NextResponse.json(await getFlowStepsInfo(flowId));
  } catch (error) {
    logServerError('api:flow:fId:get', error, {
      path: req.nextUrl.pathname,
      method: req.method,
      userId: session?.uid ?? null,
      role: session?.role ?? null,
      action: 'get-flow-steps',
      flowId,
    });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal error' },
      { status: 500 },
    );
  }
};

// export const POST = async (
//   req: NextRequest,
//   { params }: { params: { fid: number } },
// ) => {
//   await verifyRole(1);
//   const res = await req.json();
//   const type = res.type;
//   if (type === 'forward') {
//     await forward(res.fid, res.currentStepOrder);
//   } else if (type === 'backward') {
//     await backward(res.fid, res.currentStepOrder);
//   } else {
//     return NextResponse.json({ status: 400, body: 'Invalid type' });
//   }
//   return NextResponse.json({ success: true });
// };
