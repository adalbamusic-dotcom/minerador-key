import { NextResponse } from "next/server";
import { buildAgencyRef } from "@/lib/agency-routing";
import { createCanonicalServiceClient, findPendingAgencyInvitationForActor } from "@/lib/server/canonical-authorization";
import { requireSupabaseUser } from "@/lib/server/supabase-session";
import {
  AgencyOnboardingError,
  completeAgencyOnboarding,
  completeAgencyOnboardingWithConfirmedAgencyName,
  completeAgencyOnboardingForAuthenticatedActor,
  inspectAgencyInvitation,
} from "@/lib/server/agency-onboarding";
import { dispatchCommunicationMessage } from "@/lib/server/communication/dispatcher";
import { enqueueCommunicationMessage } from "@/lib/server/communication/messages";

function response(error: unknown) {
  if (error instanceof AgencyOnboardingError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
  return NextResponse.json({ error: "Não foi possível concluir o onboarding." }, { status: 401 });
}

export async function GET(request: Request) {
  try {
    const token = new URL(request.url).searchParams.get("token");
    if (token) {
      return NextResponse.json({ invitation: await inspectAgencyInvitation(createCanonicalServiceClient(), token) }, { headers: { "Cache-Control": "no-store" } });
    }

    const invitation = await findPendingAgencyInvitationForActor();
    if (!invitation) throw new AgencyOnboardingError(404, "ONBOARDING_INVITATION_UNAVAILABLE", "Não há convite pendente para esta identidade.");
    return NextResponse.json({ invitation: {
      proposed_agency_name: invitation.agencyName,
      plan_code: invitation.planCode,
      expires_at: invitation.expiresAt,
      status: "PENDING",
    } }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return response(error); }
}

export async function POST(request: Request) {
  try {
    const client = createCanonicalServiceClient();
    const body = await request.json();
    const actor = await requireSupabaseUser();
    const token = typeof body?.token === "string" && body.token ? body.token : null;
    let completed: { agencyId: string; agencyRef: string; agencyName?: string };
    let invitationId: string;
    let agencyName: string;
    let responsibleName: string;

    if (token) {
      const invitation = await inspectAgencyInvitation(client, token);
      if (invitation.status !== "PENDING") throw new AgencyOnboardingError(409, "ONBOARDING_INVITATION_UNAVAILABLE", "Este convite não está disponível.");
      if (invitation.source === "ADMIN_INVITE") {
        completed = await completeAgencyOnboardingWithConfirmedAgencyName(client, {
          idempotencyKey: body?.idempotencyKey,
          ownerUserId: actor.id,
          invitationId: invitation.id,
          confirmedAgencyName: body?.confirmedAgencyName,
          token,
        });
      } else {
        completed = await completeAgencyOnboarding(client, {
          idempotencyKey: body?.idempotencyKey,
          ownerUserId: actor.id,
          invitationId: invitation.id,
          agencyName: invitation.proposed_agency_name,
          token,
        });
      }
      invitationId = invitation.id;
      agencyName = completed.agencyName || invitation.proposed_agency_name;
      responsibleName = invitation.responsible_name;
    } else {
      const invitation = await findPendingAgencyInvitationForActor();
      if (!invitation) throw new AgencyOnboardingError(409, "ONBOARDING_INVITATION_UNAVAILABLE", "Não há convite pendente para esta identidade.");
      completed = await completeAgencyOnboardingForAuthenticatedActor(client, {
        idempotencyKey: body?.idempotencyKey,
        ownerUserId: actor.id,
        invitationId: invitation.invitationId,
        agencyName: invitation.agencyName,
      });
      invitationId = invitation.invitationId;
      agencyName = invitation.agencyName;
      responsibleName = invitation.responsibleName;
    }

    const origin = new URL(request.url).origin;
    const welcome = actor.email
      ? await enqueueCommunicationMessage(client, {
          messageType: "AGENCY_WELCOME",
          templateCode: "agency_welcome",
          templateVersion: 1,
          destination: actor.email,
          payload: {
            agencyName,
            responsibleName: typeof actor.user_metadata?.full_name === "string" ? actor.user_metadata.full_name : responsibleName,
            agencyId: completed.agencyId,
            workspacePath: "/agencias/" + buildAgencyRef(agencyName, completed.agencyId),
            origin,
          },
          idempotencyKey: "agency-welcome:" + completed.agencyId,
          agencyInvitationId: invitationId,
          agencyId: completed.agencyId,
        })
      : null;
    const dispatch = welcome ? await dispatchCommunicationMessage(client, welcome.id) : null;
    return NextResponse.json({ ...completed, welcomeDeliveryStatus: dispatch?.status || "NOT_SENT", communicationHealth: dispatch?.health || "MISSING_CREDENTIAL" }, { status: 201 });
  } catch (error) { return response(error); }
}
