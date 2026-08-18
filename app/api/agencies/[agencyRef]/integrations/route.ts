import { NextResponse } from "next/server";
import { authzErrorResponse } from "@/lib/server/authz";
import {
  createAgencyBrandDistribution,
  IntegrationGovernanceError,
  readAgencyIntegrationWorkspace,
  saveAgencyIntegrationQuota,
} from "@/lib/server/integration-governance";

function errorResponse(error: unknown) {
  if (error instanceof IntegrationGovernanceError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
  const mapped = authzErrorResponse(error);
  return NextResponse.json({ error: mapped.status >= 500 ? "Não foi possível concluir a configuração da integração." : mapped.message }, { status: mapped.status });
}

export async function GET(_request: Request, { params }: { params: Promise<{ agencyRef: string }> }) {
  try {
    return NextResponse.json(await readAgencyIntegrationWorkspace((await params).agencyRef), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ agencyRef: string }> }) {
  try {
    const body = await request.json().catch(() => ({})) as { action?: unknown; [key: string]: unknown };
    const agencyRef = (await params).agencyRef;
    if (body.action === "distribute_to_brand") {
      return NextResponse.json(await createAgencyBrandDistribution({ agencyRef, brandId: body.brandId, grantId: body.grantId }), { headers: { "Cache-Control": "no-store" } });
    }
    if (body.action === "save_quota") {
      return NextResponse.json(await saveAgencyIntegrationQuota({ agencyRef, scopeType: body.scopeType, brandId: body.brandId, limitUnits: body.limitUnits, windowKind: body.windowKind }), { headers: { "Cache-Control": "no-store" } });
    }
    return NextResponse.json({ error: "Ação de integração inválida.", code: "INTEGRATION_GOVERNANCE_INVALID_ACTION" }, { status: 400 });
  } catch (error) {
    return errorResponse(error);
  }
}
