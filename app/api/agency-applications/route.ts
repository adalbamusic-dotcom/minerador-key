import { NextResponse } from "next/server";
import { createCanonicalServiceClient } from "@/lib/server/canonical-authorization";
import { AgencyOnboardingError, createPublicAgencyApplication } from "@/lib/server/agency-onboarding";
import { dispatchCommunicationMessage } from "@/lib/server/communication/dispatcher";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const client = createCanonicalServiceClient();
    const application = await createPublicAgencyApplication(client, { agencyName: body?.agencyName, responsibleName: body?.responsibleName, destinationEmail: body?.destinationEmail, websiteUrl: body?.websiteUrl, approximateBrandCount: body?.approximateBrandCount, idempotencyKey: body?.idempotencyKey });
    const dispatch = await dispatchCommunicationMessage(client, application.message.id);
    return NextResponse.json({ status: application.status, deliveryStatus: dispatch.status, communicationHealth: dispatch.health }, { status: application.replayed ? 200 : 201 });
  } catch (error) {
    if (error instanceof AgencyOnboardingError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    return NextResponse.json({ error: "Não foi possível registrar a solicitação." }, { status: 503 });
  }
}
