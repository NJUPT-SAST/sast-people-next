import { getSignature } from '@/action/user/feishu';
import { logServerError } from '@/lib/server-error-log';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const url = searchParams.get('url');
  if (!url) {
    return NextResponse.json({ message: 'url is required' }, { status: 400 });
  }
  try {
    const params = await getSignature(url);
    return NextResponse.json(params);
  } catch (error) {
    logServerError('api:auth:signature', error, {
      path: request.nextUrl.pathname,
      method: request.method,
      action: 'get-feishu-signature',
      metadata: { url },
    });
    return NextResponse.json({ message: 'signature failed' }, { status: 500 });
  }
}
