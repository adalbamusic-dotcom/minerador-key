import { NextResponse } from "next/server";
import { createCanonicalServiceClient, requireCanonicalPlatformAdmin } from "@/lib/server/canonical-authorization";
import { AgencyOnboardingError, approveAgencyApplication, createInvitationForApprovedApplication, listAgencyApplications, rejectAgencyApplication } from "@/lib/server/agency-onboarding";
import { dispatchCommunicationMessage } from "@/lib/server/communication/dispatcher";

function errorResponse(error: unknown) {
  if (error instanceof AgencyOnboardingError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
  return NextResponse.json({ error: "Não foi possível concluir a revisão da solicitação." }, { status: 403 });
}

export async function GET() {
  try { await requireCanonicalPlatformAdmin(); return NextResponse.json({ applications: await listAgencyApplications(createCanonicalServiceClient()) }, { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return errorResponse(error); }
}

export async function PATCH(request: Request) {
  try {
    const admin = await requireCanonicalPlatformAdmin(); const body = await request.json(); const client = createCanonicalServiceClient();
    if (body?.action === "reject") { await rejectAgencyApplication(client, { applicationId: body.applicationId, actorUserId: admin.actorUserId }); return NextResponse.json({ success: true }); }
    if (body?.action === "approve") {
      const approved = await approveAgencyApplication(client, { applicationId: body.applicationId, actorUserId: admin.actorUserId, expiresAt: body.expiresAt, origin: new URL(request.url).origin });
      const dispatch = await dispatchCommunicationMessage(client, approved.message.id);
      return NextResponse.json({ invitation: approved.invitation, deliveryStatus: dispatch.status, communicationHealth: dispatch.health });
    }
    if (body?.action === "reinvite") {
      const created = await createInvitationForApprovedApplication(client, { applicationId: body.applicationId, actorUserId: admin.actorUserId, expiresAt: body.expiresAt, origin: new URL(request.url).origin });
      const dispatch = await dispatchCommunicationMessage(client, created.message.id);
      return NextResponse.json({ invitation: created.invitation, deliveryStatus: dispatch.status, communicationHealth: dispatch.health });
    }
    throw new AgencyOnboardingError(400, "AGENCY_APPLICATION_INVALID_ACTION", "Ação de revisão inválida.");
  } catch (error) { return errorResponse(error); }
}
