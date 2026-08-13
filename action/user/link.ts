"use server";

import {
  createLinkOAuthAuthorizationUrl,
  getLinkOAuthRedirectUri,
} from "@/lib/link/oauth-flow";
import { verifyRole } from "@/lib/dal";
import { getCurrentUserProfile } from "@/lib/link/user";
import {
  exchangeLinkOAuthCode,
} from "@/lib/link/oauth";
import { logServerError } from "@/lib/server-error-log";
import { redirect } from "next/navigation";

export async function redirectSASTLink(isBinding: boolean) {
  return redirect(await createLinkOAuthAuthorizationUrl(isBinding));
}

export const get_user_access_token = async (
  code: string,
  code_verifier: string
) => {
  const redirect_uri = getLinkOAuthRedirectUri();
  const token = await exchangeLinkOAuthCode(
    code,
    code_verifier,
    redirect_uri,
  );
  return token.access_token;
};

export const get_user_info = async (access_token: string) => {
  return getCurrentUserProfile(access_token);
};

export async function createCodeChallenge(isBinding: boolean) {
  const url = new URL(await createLinkOAuthAuthorizationUrl(isBinding));
  return {
    codeChallenge: url.searchParams.get("code_challenge")!,
    state: url.searchParams.get("state")!,
  };
}

export const getCurrentRedirectUri = getLinkOAuthRedirectUri;

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
