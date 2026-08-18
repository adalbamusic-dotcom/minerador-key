import { NextResponse } from "next/server";
import { createCanonicalServiceClient, requireCanonicalPlatformAdmin } from "@/lib/server/canonical-authorization";
import { AgencyOnboardingError, createDirectAgencyInvitation, listAgencyInvitations, revokeAgencyInvitation, rotateAgencyInvitation } from "@/lib/server/agency-onboarding";
import { dispatchCommunicationMessage } from "@/lib/server/communication/dispatcher";

function errorResponse(error: unknown) {
  if (error instanceof AgencyOnboardingError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
  return NextResponse.json({ error: "Não foi possível concluir a operação de convite." }, { status: 403 });
}

export async function GET() {
  try { await requireCanonicalPlatformAdmin(); return NextResponse.json({ invitations: await listAgencyInvitations(createCanonicalServiceClient()) }, { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return errorResponse(error); }
}

export async function POST(request: Request) {
  try {
    const admin = await requireCanonicalPlatformAdmin();
    const body = await request.json();
    const client = createCanonicalServiceClient();
    const created = await createDirectAgencyInvitation(client, { actorUserId: admin.actorUserId, destinationEmail: body?.destinationEmail, responsibleName: body?.responsibleName, agencyName: body?.agencyName, accessExpiresAt: body?.accessExpiresAt, origin: new URL(request.url).origin });
    const dispatch = await dispatchCommunicationMessage(client, created.message.id);
    return NextResponse.json({ invitation: created.invitation, deliveryStatus: dispatch.status, communicationHealth: dispatch.health }, { status: 201 });
  } catch (error) { return errorResponse(error); }
}

export async function PATCH(request: Request) {
  try {
    const admin = await requireCanonicalPlatformAdmin();
    const body = await request.json();
    const client = createCanonicalServiceClient();
    const origin = new URL(request.url).origin;
    if (body?.action === "rotate") {
      const rotated = await rotateAgencyInvitation(client, body?.invitationId, origin, admin.actorUserId);
      const dispatch = await dispatchCommunicationMessage(client, rotated.message.id);
      return NextResponse.json({ invitation: rotated.invitation, deliveryStatus: dispatch.status, communicationHealth: dispatch.health });
    }
    await revokeAgencyInvitation(client, body?.invitationId);
    return NextResponse.json({ success: true });
  }
  catch (error) { return errorResponse(error); }
}
