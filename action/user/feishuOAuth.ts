"use server";

import { FEISHU_OAUTH_STATE } from "@/const/cookie";
import { verifySession } from "@/lib/dal";
import { getFeishuOAuthAccountStatus } from "@/lib/feishu/oauth-account";
import crypto from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getPublicBaseUrl } from "@/lib/app-url";

function base64URLEncode(value: Buffer) {
  return value
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

export async function redirectFeishuOAuth() {
  const session = await verifySession();
  if (session.role < 2) {
    throw new Error("只有讲师及以上身份需要绑定飞书授权。");
  }

  const appId = process.env.APP_ID;
  if (!appId) {
    throw new Error("APP_ID is required for Feishu OAuth");
  }

  const state = base64URLEncode(crypto.randomBytes(24));
  const cookieStore = await cookies();
  cookieStore.set(FEISHU_OAUTH_STATE, state, {
    path: "/",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
  });

  const authorizeUrl = new URL(
    process.env.FEISHU_OAUTH_AUTHORIZE_URL ??
      "https://open.feishu.cn/open-apis/authen/v1/index",
  );
  authorizeUrl.searchParams.set("app_id", appId);
  authorizeUrl.searchParams.set("redirect_uri", getFeishuRedirectUri());
  authorizeUrl.searchParams.set("state", state);

  redirect(authorizeUrl.toString());
}

export async function getCurrentFeishuOAuthStatus() {
  const session = await verifySession();
  return getFeishuOAuthAccountStatus(session.uid);
}

function getFeishuRedirectUri() {
  return (
    process.env.FEISHU_OAUTH_REDIRECT_URI ??
    ((process.env.NODE_ENV === "development"
      ? "http://localhost:3000"
      : getPublicBaseUrl()) + "/api/auth/feishu")
  );
}
