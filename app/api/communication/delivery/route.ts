import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createCanonicalServiceClient } from "@/lib/server/canonical-authorization";
import { recordCommunicationDeliveryEvent } from "@/lib/server/communication/messages";

function validSignature(rawBody: string, signature: string | null) {
  const secret = process.env.COMMUNICATION_WEBHOOK_SECRET;
  if (!secret || !signature) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const received = Buffer.from(signature, "hex");
  const expectedBytes = Buffer.from(expected, "hex");
  return received.length === expectedBytes.length && timingSafeEqual(received, expectedBytes);
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  if (!validSignature(rawBody, request.headers.get("x-communication-signature"))) {
    return NextResponse.json({ error: "COMMUNICATION_WEBHOOK_UNAUTHORIZED" }, { status: 401 });
  }

  try {
    const body = JSON.parse(rawBody) as Record<string, unknown>;
    const eventType = body.event_type === "DELIVERED" || body.event_type === "BOUNCED" ? body.event_type : null;
    if (typeof body.message_id !== "string" || typeof body.event_id !== "string" || !eventType || typeof body.provider !== "string") {
      return NextResponse.json({ error: "COMMUNICATION_WEBHOOK_INVALID" }, { status: 400 });
    }
    const accepted = await recordCommunicationDeliveryEvent(createCanonicalServiceClient(), {
      messageId: body.message_id,
      provider: body.provider,
      providerMessageId: typeof body.provider_message_id === "string" ? body.provider_message_id : null,
      eventType,
      eventId: body.event_id,
      payload: { event_type: eventType, provider: body.provider, provider_message_id: body.provider_message_id || null },
    });
    return NextResponse.json({ accepted }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "COMMUNICATION_WEBHOOK_FAILED" }, { status: 503 });
  }
}
