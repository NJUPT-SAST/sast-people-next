import { deleteSession } from '@/lib/session';
import { SESSION } from '@/const/cookie';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  await deleteSession();
  const host = request.headers.get("x-forwarded-host") || request.nextUrl.host;
  const proto = request.headers.get("x-forwarded-proto") || "https";
  const reason = request.nextUrl.searchParams.get("reason");
  const loginUrl = new URL(`/login`, `${proto}://${host}`);
  if (reason === "link-authorization") {
    loginUrl.searchParams.set("reason", reason);
  }
  const response = NextResponse.redirect(loginUrl);
  response.cookies.delete(SESSION);
  return response;
}
