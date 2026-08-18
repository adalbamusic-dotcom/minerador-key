import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { createCanonicalServiceClient, requireCanonicalPlatformAdmin } from "@/lib/server/canonical-authorization";
import { dispatchCommunicationMessage } from "@/lib/server/communication/dispatcher";
import { getCommunicationConfig, getCommunicationHealth, markCommunicationReady, saveCommunicationConfig, sendCommunicationTest } from "@/lib/server/communication/service";

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "Não foi possível concluir a operação de comunicação.";
  const safe = /COMMUNICATION_|42P01|REMOTE_UNAVAILABLE/.test(message) ? message : "Não foi possível concluir a operação de comunicação.";
  return NextResponse.json({ error: safe }, { status: 400 });
}

function isEmail(value: unknown): value is string {
  return typeof value === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function sanitizedConfig(config: Awaited<ReturnType<typeof getCommunicationConfig>>) {
  return { provider: config.provider, status: config.status, health: config.health, senderName: config.senderName, senderEmail: config.senderEmail, domain: config.domain, credentialConfigured: config.credentialConfigured, validatedAt: config.validatedAt, lastErrorCode: config.lastErrorCode };
}

export async function GET() {
  try { await requireCanonicalPlatformAdmin(); const config = await getCommunicationHealth(createCanonicalServiceClient()); return NextResponse.json({ config: sanitizedConfig(config) }, { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return errorResponse(error); }
}

export async function POST(request: Request) {
  try {
    await requireCanonicalPlatformAdmin();
    const body = await request.json().catch(() => ({}));
    const client = createCanonicalServiceClient();
    const action = body?.action || "save";
    if (action === "dispatch_once") {
      const dispatch = await dispatchCommunicationMessage(client);
      return NextResponse.json({ deliveryStatus: dispatch.status, communicationHealth: dispatch.health, errorCode: dispatch.errorCode }, { headers: { "Cache-Control": "no-store" } });
    }
    if (action === "save") {
      if (typeof body?.senderName !== "string" || !body.senderName.trim()) throw new Error("COMMUNICATION_SENDER_NAME_REQUIRED");
      if (!isEmail(body?.senderEmail)) throw new Error("COMMUNICATION_SENDER_EMAIL_INVALID");
      const config = await saveCommunicationConfig(client, { provider: body?.provider || "resend", senderName: body.senderName, senderEmail: body.senderEmail, domain: typeof body?.domain === "string" ? body.domain : undefined, secret: typeof body?.apiKey === "string" ? body.apiKey : undefined });
      return NextResponse.json({ config: sanitizedConfig(config) }, { headers: { "Cache-Control": "no-store" } });
    }
    if (action === "test_connection" || action === "send_test_email") {
      const config = await getCommunicationConfig(client);
      const destination = body?.destination || config.senderEmail;
      if (!isEmail(destination)) throw new Error("COMMUNICATION_TEST_DESTINATION_INVALID");
      const result = await sendCommunicationTest(client, { destination, idempotencyKey: `communication-test-${randomUUID()}` });
      if (result.status === "SENT") await markCommunicationReady(client);
      return NextResponse.json({ deliveryStatus: result.status, provider: result.provider, errorCode: result.errorCode, providerErrorType: result.providerErrorType, providerErrorMessage: result.providerErrorMessage, providerHttpStatus: result.providerHttpStatus, config: sanitizedConfig(await getCommunicationHealth(client)) }, { headers: { "Cache-Control": "no-store" } });
    }
    throw new Error("COMMUNICATION_ACTION_INVALID");
  } catch (error) { return errorResponse(error); }
}
