import { NextRequest, NextResponse } from "next/server";
import { SESSION, SESSION_ID_PATTERN } from "@/const/cookie";

const protectedRoutes = ["/dashboard"];

export async function proxy(req: NextRequest) {
  const path = req.nextUrl.pathname;
  const isProtectedRoute = protectedRoutes.some((route) => path.startsWith(route));
  const cookie = req.cookies.get(SESSION)?.value;
  const hasSessionCookie = Boolean(cookie && SESSION_ID_PATTERN.test(cookie));

  if (isProtectedRoute && !hasSessionCookie) {
    return NextResponse.redirect(new URL("/login", req.nextUrl));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|.*\\.png$).*)"],
};
