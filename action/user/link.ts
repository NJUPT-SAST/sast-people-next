"use server";

import {
  IS_BINDING,
  LINK_OAUTH_PURPOSE,
  LINK_OAUTH_STATE,
} from "@/const/cookie";
import { verifyRole } from "@/lib/dal";
import { getCurrentUserProfile } from "@/lib/link/user";
import {
  createLinkOAuthUrl,
  exchangeLinkOAuthCode,
  getLinkAdminOAuthScopes,
  getLinkOAuthClientId,
  getLinkOAuthScopes,
  type LinkOAuthPurpose,
} from "@/lib/link/oauth";
import { logServerError } from "@/lib/server-error-log";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import crypto from "node:crypto";
import { getPublicBaseUrl } from "@/lib/app-url";

export type { LinkOAuthPurpose } from "@/lib/link/oauth";

export async function redirectSASTLink(
  isBinding: boolean,
  purpose: LinkOAuthPurpose = "session",
) {
  if (purpose === "admin") {
    await verifyRole(2);
  }
  const { codeChallenge, state } = await createCodeChallenge(isBinding, purpose);
  const redirect_uri = await getCurrentRedirectUri();
  const url = createLinkOAuthUrl("/oauth/authorize");
  url.searchParams.set("client_id", getLinkOAuthClientId(purpose));
  url.searchParams.set("code_challenge", codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("redirect_uri", redirect_uri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set(
    "scope",
    purpose === "admin" ? getLinkAdminOAuthScopes() : getLinkOAuthScopes(),
  );
  url.searchParams.set("state", state);
  return redirect(url.toString());
}

export const get_user_access_token = async (
  code: string,
  code_verifier: string
) => {
  const redirect_uri = await getCurrentRedirectUri();
  const token = await exchangeLinkOAuthCode(
    code,
    code_verifier,
    redirect_uri,
    "session",
  );
  return token.access_token;
};

export const get_user_info = async (access_token: string) => {
  return getCurrentUserProfile(access_token);
};

function base64URLEncode(str: Buffer) {
  return str
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

function sha256(buffer: Buffer | string) {
  return crypto.createHash("sha256").update(buffer).digest();
}

export async function createCodeChallenge(
  isBinding: boolean,
  purpose: LinkOAuthPurpose = "session",
) {
  if (purpose === "admin") {
    await verifyRole(2);
  }
  const code_verifier = base64URLEncode(crypto.randomBytes(32));
  const state = base64URLEncode(crypto.randomBytes(24));
  const cookieStore = await cookies();
  const codeChallenge = base64URLEncode(sha256(code_verifier));
  cookieStore.set("link_code_verifier", code_verifier, {
    path: "/",
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 600, // 10 minutes
  });
  cookieStore.set(LINK_OAUTH_STATE, state, {
    path: "/",
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 600,
  });
  cookieStore.set(LINK_OAUTH_PURPOSE, purpose, {
    path: "/",
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 600,
  });
  if (isBinding) {
    cookieStore.set(IS_BINDING, "1", {
      path: "/",
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      maxAge: 600,
    });
  }
  return { codeChallenge, state };
}

export async function getCurrentRedirectUri() {
  return (
    (process.env.NODE_ENV === "development"
      ? "http://localhost:3001"
      : getPublicBaseUrl()) + "/api/auth/link"
  );
}

export async function bindingLinkAccount(studentId: string) {
  let session: Awaited<ReturnType<typeof verifyRole>> | null = null;

  try {
    void studentId;
    session = await verifyRole(3);
    return {
      success: false,
      error: {
        message: "People v3 不再绑定本地 Link 账号，请直接使用 SAST Link 登录。",
      },
    };
  } catch (error) {
    logServerError("user:bindingLinkAccount", error, {
      path: "/dashboard/manage",
      userId: session?.uid ?? null,
      role: session?.role ?? null,
      action: "binding-link-account",
      studentId,
    });
    throw error;
  }
}
