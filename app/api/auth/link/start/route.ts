import { createLinkOAuthAuthorizationUrl } from "@/lib/link/oauth-flow";
import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.redirect(await createLinkOAuthAuthorizationUrl());
}
