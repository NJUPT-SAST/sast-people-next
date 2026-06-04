import "server-only";

import { FEISHU_OAUTH_STATE } from "@/const/cookie";
import { verifySession } from "@/lib/dal";
import { upsertFeishuOAuthAccount } from "@/lib/feishu/oauth-account";
import { exchangeFeishuOAuthCode } from "@/lib/feishu/user-auth";
import { logServerError } from "@/lib/server-error-log";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get("code");
  const state = searchParams.get("state");

  if (!code) {
    return NextResponse.json({ message: "code is required" }, { status: 400 });
  }

  const cookieStore = await cookies();
  const expectedState = cookieStore.get(FEISHU_OAUTH_STATE)?.value;
  if (expectedState && (!state || state !== expectedState)) {
    return NextResponse.json({ message: "invalid oauth state" }, { status: 400 });
  }

  let session: Awaited<ReturnType<typeof verifySession>> | null = null;
  try {
    session = await verifySession();
    const token = await exchangeFeishuOAuthCode(code);
    await upsertFeishuOAuthAccount(session.uid, token);
    cookieStore.delete(FEISHU_OAUTH_STATE);
  } catch (error) {
    logServerError("api:auth:feishu", error, {
      path: request.nextUrl.pathname,
      method: request.method,
      userId: session?.uid ?? null,
      role: session?.role ?? null,
      action: "bind-feishu-oauth",
      metadata: {
        hasCode: Boolean(code),
        hasState: Boolean(state),
      },
    });
    throw error;
  }

  redirect("/dashboard/recruitment");
}
