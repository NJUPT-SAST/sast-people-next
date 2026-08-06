import "server-only";

import { FEISHU_OAUTH_STATE } from "@/const/cookie";
import { verifySession } from "@/lib/dal";
import { sendFeishuOAuthBoundCard } from "@/lib/feishu/interview-message";
import { upsertFeishuOAuthAccount } from "@/lib/feishu/oauth-account";
import { exchangeFeishuOAuthCode } from "@/lib/feishu/user-auth";
import { shouldUseLinkFeishuTestMock } from "@/lib/link/client";
import { getLinkAccessTokenFromSession } from "@/lib/link/session";
import { getCurrentUserProfile } from "@/lib/link/user";
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
  if (!expectedState || !state || state !== expectedState) {
    return NextResponse.json({ message: "invalid oauth state" }, { status: 400 });
  }

  let session: Awaited<ReturnType<typeof verifySession>> | null = null;
  try {
    session = await verifySession();
    if (session.role < 2) {
      return NextResponse.json({ message: "forbidden" }, { status: 403 });
    }
    const token = await exchangeFeishuOAuthCode(code);
    await assertFeishuUnionMatchesLinkIdentity(token.unionId);
    await upsertFeishuOAuthAccount(session.uid, token);
    await notifyFeishuOAuthBound(token.openId, request);
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

  redirect("/dashboard");
}

const assertFeishuUnionMatchesLinkIdentity = async (unionId: string) => {
  if (shouldUseLinkFeishuTestMock()) {
    return;
  }

  const accessToken = await getLinkAccessTokenFromSession();
  const profile = await getCurrentUserProfile(accessToken);
  const linkLarkIdentity = profile.identities?.find(
    (identity) => identity.provider === "lark",
  );

  if (!linkLarkIdentity?.provider_id) {
    throw new Error("当前 Link 账号未绑定飞书身份，无法绑定飞书 OAuth。");
  }

  if (linkLarkIdentity.provider_id !== unionId) {
    throw new Error("飞书账号与当前 Link 账号不匹配，请使用同一个飞书身份。");
  }
};

const notifyFeishuOAuthBound = async (openId: string, request: NextRequest) => {
  try {
    await sendFeishuOAuthBoundCard(openId);
  } catch (error) {
    logServerError("api:auth:feishu", error, {
      path: request.nextUrl.pathname,
      method: request.method,
      action: "notify-feishu-oauth-bound",
      metadata: { openId },
    });
  }
};
