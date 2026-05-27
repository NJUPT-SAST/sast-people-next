import { NextRequest, NextResponse } from 'next/server';
import { findUserFlowId } from '@/action/user-flow/find';
import { logServerError } from '@/lib/server-error-log';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const studentId = searchParams.get('studentId');
    const flowId = searchParams.get('flowId');

    if (!studentId || !flowId) {
      return NextResponse.json(
        { success: false, message: '缺少必需参数: studentId 和 flowId' },
        { status: 400 }
      );
    }

    const userFlowId = await findUserFlowId(studentId, Number(flowId));

    if (userFlowId === null) {
      return NextResponse.json(
        { success: false, message: '该同学未报名当前阅卷流程' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, userFlowId });
  } catch (error) {
    console.error('API Error:', error);
    logServerError('api:user-flow:get', error);
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : '查询失败' },
      { status: 500 }
    );
  }
}
