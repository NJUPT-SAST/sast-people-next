import { createSession } from "@/lib/session";
import { NextRequest, NextResponse } from "next/server";

type TestSessionRequest = {
  uid?: unknown;
  role?: unknown;
  name?: unknown;
};

export async function POST(request: NextRequest) {
  if (process.env.PLAYWRIGHT_TEST_MODE !== "1") {
    return NextResponse.json({ message: "not found" }, { status: 404 });
  }

  const body = (await request.json()) as TestSessionRequest;
  if (
    !Number.isInteger(body.uid) ||
    !Number.isInteger(body.role) ||
    typeof body.name !== "string" ||
    body.name.length === 0
  ) {
    return NextResponse.json({ message: "invalid test session" }, { status: 400 });
  }

  const role = body.role as number;
  const linkAdminTokenMarker = role >= 2
    ? {
        accessToken: "playwright-link-access-token",
        accessTokenExpiresAt: Date.now() + 60 * 60 * 1000,
      }
    : undefined;

  await createSession(
    body.uid as number,
    body.name,
    role,
    undefined,
    linkAdminTokenMarker,
  );
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
