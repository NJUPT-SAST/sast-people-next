import { getCurrentRedirectUri } from "@/action/user/link";
import { IS_BINDING, LINK_OAUTH_STATE } from "@/const/cookie";
import { linkRoleToPeopleRole } from "@/lib/link/role";
import { getCurrentUserProfile } from "@/lib/link/user";
import { exchangeLinkOAuthCode } from "@/lib/link/oauth";
import { shouldUseLinkFeishuTestMock } from "@/lib/link/client";
import { createSession } from "@/lib/session";
import { cookies } from "next/headers";
import { getURLFromRedirectError } from "next/dist/client/components/redirect";
import { redirect } from "next/navigation";
import { NextRequest, NextResponse } from "next/server";
import "server-only";
import { logServerError } from "@/lib/server-error-log";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  if (!code) {
    return NextResponse.json({ message: "code is required" }, { status: 400 });
  }
  const cookieStore = await cookies();
  const code_verifier = cookieStore.get("link_code_verifier")?.value;
  const expectedState = cookieStore.get(LINK_OAUTH_STATE)?.value;
  if (!code_verifier) {
    return NextResponse.json(
      { message: "code_verifier is missing" },
      { status: 400 }
    );
  }
  if (!state || !expectedState || state !== expectedState) {
    return NextResponse.json(
      { message: "invalid oauth state" },
      { status: 400 }
    );
  }
  try {
    const redirectUri = await getCurrentRedirectUri();
    const token = await exchangeLinkOAuthCode(code, code_verifier, redirectUri);
    if (!token.access_token) {
      return NextResponse.json(
        { message: "get user access token failed" },
        { status: 500 }
      );
    }
    const profile = await getCurrentUserProfile(token.access_token);
    if (!profile) {
      return NextResponse.json(
        { message: "get user info failed" },
        { status: 500 }
      );
    }

    cookieStore.delete("link_code_verifier");
    cookieStore.delete(LINK_OAUTH_STATE);

    if (cookieStore.get(IS_BINDING)?.value === "1") {
      cookieStore.delete(IS_BINDING);
    }

    const peopleRole = shouldUseLinkFeishuTestMock()
      ? 2
      : linkRoleToPeopleRole(profile.role);

    await createSession(
      profile.id,
      profile.name,
      peopleRole,
      {
        accessToken: token.access_token,
        refreshToken: token.refresh_token,
        accessTokenExpiresAt: Date.now() + token.expires_in * 1000,
      },
    );

    return redirect("/dashboard");
  } catch (err) {
    if (err instanceof Error && err.message === "NEXT_REDIRECT") throw err;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (getURLFromRedirectError(err as any) !== null) throw err;
    const subErrors =
      err instanceof AggregateError
        ? err.errors.map((e) => String(e))
        : undefined;
    logServerError("api:auth:link", err, {
      path: request.nextUrl.pathname,
      method: request.method,
      action: cookieStore.get(IS_BINDING)?.value === "1" ? "bind-link" : "login-link",
      metadata: {
        hasCode: Boolean(code),
        hasCodeVerifier: Boolean(code_verifier),
        hasState: Boolean(state),
        subErrors,
      },
    });
    return NextResponse.json(
      {
        message: "link auth failed",
        error: String(err),
        name: err instanceof Error ? err.name : typeof err,
        stack: err instanceof Error ? err.stack?.split("\n")[0] : undefined,
        subErrors,
      },
      { status: 500 }
    );
  }
}
