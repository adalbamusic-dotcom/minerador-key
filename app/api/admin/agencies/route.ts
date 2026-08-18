import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { authzErrorResponse } from "@/lib/server/authz";
import { requireCanonicalPlatformAdmin } from "@/lib/server/canonical-authorization";
import { getCommunicationHealth } from "@/lib/server/communication/service";
import {
  AgencyAdminError,
  listAdminAgencies,
  setAdminAgencyBrandStatus,
  setAdminAgencyMembershipStatus,
  updateAdminAgency,
  upsertAdminAgencyBrand,
  upsertAdminAgencyMembership,
} from "@/lib/server/agency-admin";

function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!url || !key) throw new Error("Configuração server-side do Supabase ausente.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function errorResponse(error: unknown) {
  if (error instanceof AgencyAdminError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
  const mapped = authzErrorResponse(error);
  return NextResponse.json({ error: mapped.status >= 500 ? "Não foi possível concluir a administração de agências." : mapped.message }, { status: mapped.status });
}

async function adminContext() {
  const admin = await requireCanonicalPlatformAdmin();
  return { profile: { isAdmin: true, userId: admin.actorUserId }, client: createServiceClient() };
}

export async function GET() {
  try {
    const { profile, client } = await adminContext();
    const communication = await getCommunicationHealth(client);
    return NextResponse.json({ ...(await listAdminAgencies({ profile, client })), communicationStatus: communication.status, communicationHealth: communication.health }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return errorResponse(error); }
}

export async function POST() {
  return NextResponse.json({ error: "A criação direta de agências foi substituída por convite ou onboarding do cliente.", code: "AGENCY_DIRECT_CREATE_RETIRED" }, { status: 405, headers: { Allow: "GET, PATCH" } });
}

export async function PATCH(request: Request) {
  try {
    const { profile, client } = await adminContext();
    const body = await request.json();
    if (["generate_temporary_access", "send_access_email", "send_password_recovery", "generate_password_recovery"].includes(body?.action)) {
      throw new AgencyAdminError(410, "AGENCY_ADMIN_LEGACY_ACCESS_FLOW_RETIRED", "Acesso permanente usa login normal; a recuperação é iniciada pelo próprio usuário em /recuperar-senha.");
    }
    switch (body?.action) {
      case "update_agency": await updateAdminAgency({ profile, client, agencyId: body.agencyId, name: body.name, status: body.status }); break;
      case "save_membership": await upsertAdminAgencyMembership({ profile, client, agencyId: body.agencyId, userId: body.userId, role: body.role, status: body.status }); break;
      case "set_membership_status": await setAdminAgencyMembershipStatus({ profile, client, membershipId: body.membershipId, status: body.status }); break;
      case "link_brand": await upsertAdminAgencyBrand({ profile, client, agencyId: body.agencyId, brandId: body.brandId }); break;
      case "set_brand_link_status": await setAdminAgencyBrandStatus({ profile, client, linkId: body.linkId, status: body.status }); break;
      default: throw new AgencyAdminError(400, "AGENCY_ADMIN_INVALID_ACTION", "Ação administrativa inválida.");
    }
    return NextResponse.json({ success: true });
  } catch (error) { return errorResponse(error); }
}
