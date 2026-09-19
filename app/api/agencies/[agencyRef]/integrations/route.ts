import { NextResponse } from "next/server";
import { authzErrorResponse } from "@/lib/server/authz";
import {
  assertAgencyMcpBrand,
  createAgencyBrandDistribution,
  IntegrationGovernanceError,
  reactivateAgencyWriterMcpGrant,
  registerAgencyMcpClient,
  readAgencyIntegrationWorkspace,
  revokeAgencyMcpClient,
  revokeAgencyWriterMcpDelegation,
  revokeAgencyWriterMcpGrant,
  saveAgencyIntegrationQuota,
} from "@/lib/server/integration-governance";
import { requireCanonicalSessionProfile } from "@/lib/server/authz";
import { readMcpRuntimeConfig } from "@/lib/server/mcp-runtime-config";
import { issueWriterMcpDelegation } from "@/lib/server/writer-mcp-delegation";

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
    if (body.action === "register_mcp_client") {
      return NextResponse.json(await registerAgencyMcpClient({ agencyRef, providerKey: body.providerKey, clientName: body.clientName, scopes: body.scopes }), { headers: { "Cache-Control": "no-store" } });
    }
    if (body.action === "create_writer_mcp_delegation") {
      // Bearer é diagnóstico: em produção só existe com opt-in explícito da Plataforma.
      const runtime = readMcpRuntimeConfig();
      if (runtime.production && !runtime.remoteBearerAllowed) {
        return NextResponse.json({ error: "O bearer de diagnóstico está desativado em produção. Conecte aplicativos por OAuth.", code: "MCP_BEARER_DISABLED" }, { status: 409 });
      }
      const profile = await requireCanonicalSessionProfile();
      const { brandId } = await assertAgencyMcpBrand({ agencyRef, brandId: body.brandId });
      const delegation = await issueWriterMcpDelegation({
        profile,
        brandId,
        clientName: typeof body.clientName === "string" ? body.clientName : "Cliente MCP do Redator",
        scopes: Array.isArray(body.scopes) ? body.scopes as Array<"writer.read" | "writer.draft.write" | "writer.media.brief"> : ["writer.read"],
        days: typeof body.days === "number" ? body.days : Number(body.days),
      });
      return NextResponse.json({ delegation }, { headers: { "Cache-Control": "no-store" } });
    }
    if (body.action === "revoke_writer_mcp_delegation") {
      return NextResponse.json(await revokeAgencyWriterMcpDelegation({ agencyRef, delegationId: body.delegationId, brandId: body.brandId }), { headers: { "Cache-Control": "no-store" } });
    }
    if (body.action === "revoke_writer_mcp_grant") {
      return NextResponse.json(await revokeAgencyWriterMcpGrant({ agencyRef, grantId: body.grantId }), { headers: { "Cache-Control": "no-store" } });
    }
    if (body.action === "reactivate_writer_mcp_grant") {
      return NextResponse.json(await reactivateAgencyWriterMcpGrant({ agencyRef, grantId: body.grantId }), { headers: { "Cache-Control": "no-store" } });
    }
    if (body.action === "revoke_mcp_client") {
      return NextResponse.json(await revokeAgencyMcpClient({ agencyRef, connectionId: body.connectionId }), { headers: { "Cache-Control": "no-store" } });
    }
    return NextResponse.json({ error: "Ação de integração inválida.", code: "INTEGRATION_GOVERNANCE_INVALID_ACTION" }, { status: 400 });
  } catch (error) {
    return errorResponse(error);
  }
}
