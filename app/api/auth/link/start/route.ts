import { createLinkOAuthAuthorizationUrl } from "@/lib/link/oauth-flow";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  return NextResponse.redirect(
    await createLinkOAuthAuthorizationUrl(
      false,
      request.nextUrl.searchParams.get("next") ?? undefined,
    ),
  );
}
