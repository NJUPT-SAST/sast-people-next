// import { backward, forward } from '@/action/user-flow/edit';
import { useFlowStepsInfo as getFlowStepsInfo } from '@/hooks/useFlowStepsInfo';
import { verifyRole } from '@/lib/dal';
import { logServerError } from '@/lib/server-error-log';
import { NextRequest, NextResponse } from 'next/server';

export const GET = async (
  req: NextRequest,
  context: { params: Promise<{ fid: string }> },
) => {
  const { fid } = await context.params;
  let session: Awaited<ReturnType<typeof verifyRole>> | null = null;

  try {
    session = await verifyRole(3);
    return NextResponse.json(await getFlowStepsInfo(Number(fid)));
  } catch (error) {
    logServerError('api:flow:fId:get', error, {
      path: req.nextUrl.pathname,
      method: req.method,
      userId: session?.uid ?? null,
      role: session?.role ?? null,
      action: 'get-flow-steps',
      flowId: Number(fid),
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
