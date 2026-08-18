import { NextResponse } from "next/server";
import { authzErrorResponse } from "@/lib/server/authz";
import { AgencyWorkspaceError, saveAgencyMember, searchAgencyMembers, setAgencyMemberStatus } from "@/lib/server/agency-workspace";

function errorResponse(error: unknown) {
  if (error instanceof AgencyWorkspaceError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
  const mapped = authzErrorResponse(error);
  return NextResponse.json({ error: mapped.status >= 500 ? "Não foi possível concluir a operação de membros." : mapped.message }, { status: mapped.status });
}

export async function GET(request: Request, { params }: { params: Promise<{ agencyRef: string }> }) {
  try {
    const { agencyRef } = await params;
    const query = new URL(request.url).searchParams.get("q") || "";
    return NextResponse.json({ candidates: await searchAgencyMembers({ agencyRef, query }) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: Request, { params }: { params: Promise<{ agencyRef: string }> }) {
  try {
    const { agencyRef } = await params;
    const body = await request.json().catch(() => ({}));
    return NextResponse.json(await saveAgencyMember({ agencyRef, email: body?.email, role: body?.role, status: body?.status || "active", capabilities: body?.capabilities }));
  } catch (error) { return errorResponse(error); }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ agencyRef: string }> }) {
  try {
    const { agencyRef } = await params;
    const body = await request.json().catch(() => ({}));
    return NextResponse.json(await setAgencyMemberStatus({ agencyRef, membershipId: body?.membershipId, status: body?.status }));
  } catch (error) { return errorResponse(error); }
}
