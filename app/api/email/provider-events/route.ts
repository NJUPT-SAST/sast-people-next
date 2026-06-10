import { NextRequest, NextResponse } from "next/server";

import { getEmailWebhookSecret } from "@/lib/email-center/config";
import {
  applyEmailProviderEvent,
  parseEmailProviderEventPayload,
  verifyEmailWebhookSecret,
} from "@/lib/email-center/provider-events";
import { logServerError } from "@/lib/server-error-log";

export const runtime = "nodejs";

function getProvidedSecret(request: NextRequest) {
  const bearer = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i);
  return request.headers.get("x-email-webhook-secret") ?? bearer?.[1]?.trim() ?? null;
}

export async function POST(request: NextRequest) {
  const expectedSecret = getEmailWebhookSecret();
  const providedSecret = getProvidedSecret(request);

  if (!verifyEmailWebhookSecret({ expectedSecret, providedSecret })) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const payload = await request.json();
    const providerEvent = parseEmailProviderEventPayload(payload);
    const result = await applyEmailProviderEvent(providerEvent);
    return NextResponse.json(result);
  } catch (error) {
    logServerError("api:email:provider-events", error, {
      path: "/api/email/provider-events",
      action: "handle-email-provider-event",
    });

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid event payload" },
      { status: 400 },
    );
  }
}
