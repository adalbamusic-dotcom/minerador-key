import { NextResponse } from "next/server";
import { authzErrorResponse } from "@/lib/server/authz";
import { AgencyWorkspaceError, createAgencyBrand } from "@/lib/server/agency-workspace";

function errorResponse(error: unknown) {
  if (error instanceof AgencyWorkspaceError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
  const mapped = authzErrorResponse(error);
  return NextResponse.json({ error: mapped.status >= 500 ? "Não foi possível cadastrar a Brand." : mapped.message }, { status: mapped.status });
}

export async function POST(request: Request, { params }: { params: Promise<{ agencyRef: string }> }) {
  try {
    const { agencyRef } = await params;
    const body = await request.json().catch(() => ({}));
    return NextResponse.json(await createAgencyBrand({ agencyRef, name: body?.name, siteUrl: body?.siteUrl, nicho: body?.nicho, localizacao: body?.localizacao }), { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) { return errorResponse(error); }
}
