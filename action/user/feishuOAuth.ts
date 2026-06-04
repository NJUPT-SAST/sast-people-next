"use server";

import { FEISHU_OAUTH_STATE } from "@/const/cookie";
import { verifySession } from "@/lib/dal";
import crypto from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

function base64URLEncode(value: Buffer) {
  return value
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

export async function redirectFeishuOAuth() {
  await verifySession();

  const appId = process.env.APP_ID;
  if (!appId) {
    throw new Error("APP_ID is required for Feishu OAuth");
  }

  const state = base64URLEncode(crypto.randomBytes(24));
  const cookieStore = await cookies();
  cookieStore.set(FEISHU_OAUTH_STATE, state, {
    path: "/",
    httpOnly: true,
    secure: true,
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

function getFeishuRedirectUri() {
  return (
    process.env.FEISHU_OAUTH_REDIRECT_URI ??
    ((process.env.NODE_ENV === "development"
      ? "http://localhost:3001"
      : "https://nextpeople.sast.fun") + "/api/auth/feishu")
  );
}
