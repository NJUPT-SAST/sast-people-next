import { deleteSession } from '@/lib/session';
import { SESSION } from '@/const/cookie';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  await deleteSession();
  const response = NextResponse.redirect(new URL('/login', request.url));
  response.cookies.delete(SESSION);
  return response;
}
