import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { groupWriterMcpGrantsByClient, normalizeConsentBrandSelection, WRITER_MCP_SCOPES, WriterMcpConsentError } from "@/lib/redator/mcp-consent-domain";
import { authzErrorResponse, requireCanonicalSessionProfile } from "@/lib/server/authz";
import { PersistenceUnavailableError } from "@/lib/server/editorial-db";
import { readMcpRuntimeConfig } from "@/lib/server/mcp-runtime-config";
import { WriterMcpAuthError } from "@/lib/server/writer-mcp-delegation";
import { createWriterMcpGrants, listWriterConsentBrandOptions, listWriterMcpGrantsForActor, revokeWriterMcpGrantForActor } from "@/lib/server/writer-mcp-grants";

/*
 * AUTOATENDIMENTO DO USUÁRIO SOBRE SUAS CONEXÕES DE IA.
 *
 * O Supabase memoriza o consentimento e auto-aprova reconexões do mesmo
 * cliente; a tela de consentimento não reaparece. Quando o servidor MCP
 * recebe um token válido sem grant, responde `grant_required` apontando para
 * `/conta`, e é aqui que o usuário escolhe Marcas e permissões por cliente.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = { headers: { "Cache-Control": "no-store" } };

const CreateSchema = z.object({
  oauthClientId: z.string().min(1).max(200),
  clientName: z.string().max(120).optional(),
  brandIds: z.array(z.string().uuid()).min(1).max(50),
  scopes: z.array(z.string().max(40)).min(1).max(3),
});
const RevokeSchema = z.object({ grantId: z.string().uuid() });

function failure(error: unknown) {
  if (error instanceof z.ZodError) return NextResponse.json({ code: "invalid_input", error: "Pedido inválido." }, { status: 400, ...noStore });
  if (error instanceof WriterMcpConsentError) return NextResponse.json({ code: error.code, error: error.message }, { status: error.status, ...noStore });
  if (error instanceof WriterMcpAuthError) return NextResponse.json({ code: error.code, error: "Não foi possível atualizar a conexão." }, { status: error.status, ...noStore });
  if (error instanceof PersistenceUnavailableError) return NextResponse.json({ code: error.code, error: "Persistência indisponível." }, { status: 503, ...noStore });
  const mapped = authzErrorResponse(error);
  return NextResponse.json({ error: mapped.message }, { status: mapped.status, ...noStore });
}

export async function GET() {
  try {
    const profile = await requireCanonicalSessionProfile();
    const config = readMcpRuntimeConfig();
    if (!config.oauthEnabled) return NextResponse.json({ enabled: false, clients: [], brands: [], scopes: WRITER_MCP_SCOPES }, noStore);
    const [grants, brands] = await Promise.all([listWriterMcpGrantsForActor(profile), listWriterConsentBrandOptions(profile)]);
    return NextResponse.json({ enabled: true, clients: groupWriterMcpGrantsByClient(grants), brands, scopes: WRITER_MCP_SCOPES }, noStore);
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!readMcpRuntimeConfig().oauthEnabled) return NextResponse.json({ code: "oauth_disabled" }, { status: 409, ...noStore });
    const input = CreateSchema.parse(await request.json());
    const profile = await requireCanonicalSessionProfile();
    const options = await listWriterConsentBrandOptions(profile);
    const brands = normalizeConsentBrandSelection(input.brandIds, options);
    const grants = await createWriterMcpGrants({ profile, oauthClientId: input.oauthClientId.trim(), clientName: input.clientName, brands, scopes: input.scopes });
    return NextResponse.json({ success: true, grants }, noStore);
  } catch (error) {
    return failure(error);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    if (!readMcpRuntimeConfig().oauthEnabled) return NextResponse.json({ code: "oauth_disabled" }, { status: 409, ...noStore });
    const input = RevokeSchema.parse(await request.json());
    const profile = await requireCanonicalSessionProfile();
    const revoked = await revokeWriterMcpGrantForActor(profile, input.grantId);
    return NextResponse.json({ success: true, grantId: revoked.id, revokedAt: revoked.revoked_at }, noStore);
  } catch (error) {
    return failure(error);
  }
}
