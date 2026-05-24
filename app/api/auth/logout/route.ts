import { deleteSession } from '@/lib/session';
import { SESSION } from '@/const/cookie';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  await deleteSession();
  const host = request.headers.get("x-forwarded-host") || request.nextUrl.host;
  const proto = request.headers.get("x-forwarded-proto") || "https";
  const response = NextResponse.redirect(new URL(`/login`, `${proto}://${host}`));
  response.cookies.delete(SESSION);
  return response;
}
