import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { normalizeConsentBrandSelection, normalizeWriterMcpScopes, WRITER_MCP_SCOPES, WriterMcpConsentError } from "@/lib/redator/mcp-consent-domain";
import { authzErrorResponse, requireCanonicalSessionProfile } from "@/lib/server/authz";
import { PersistenceUnavailableError } from "@/lib/server/editorial-db";
import { readMcpRuntimeConfig } from "@/lib/server/mcp-runtime-config";
import { WriterMcpAuthError } from "@/lib/server/writer-mcp-delegation";
import { createWriterMcpGrants, listWriterConsentBrandOptions } from "@/lib/server/writer-mcp-grants";
import { createServerSupabaseClient } from "@/lib/supabase/server-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RequestSchema = z.object({
  authorizationId: z.string().regex(/^[A-Za-z0-9_-]{8,200}$/),
  decision: z.enum(["approve", "deny"]),
  brandIds: z.array(z.string().uuid()).max(50).default([]),
  scopes: z.array(z.string().max(40)).max(WRITER_MCP_SCOPES.length).default([]),
});

const noStore = { headers: { "Cache-Control": "no-store" } };

function failure(error: unknown) {
  if (error instanceof z.ZodError) return NextResponse.json({ code: "invalid_input", error: "Pedido inválido." }, { status: 400, ...noStore });
  if (error instanceof WriterMcpConsentError) return NextResponse.json({ code: error.code, error: error.message }, { status: error.status, ...noStore });
  if (error instanceof WriterMcpAuthError) return NextResponse.json({ code: error.code, error: "Não foi possível registrar a autorização." }, { status: error.status, ...noStore });
  if (error instanceof PersistenceUnavailableError) return NextResponse.json({ code: error.code, error: "Persistência indisponível." }, { status: 503, ...noStore });
  const mapped = authzErrorResponse(error);
  return NextResponse.json({ error: mapped.message }, { status: mapped.status, ...noStore });
}

export async function POST(request: NextRequest) {
  try {
    if (!readMcpRuntimeConfig().oauthEnabled) return NextResponse.json({ code: "oauth_disabled" }, { status: 404, ...noStore });
    const input = RequestSchema.parse(await request.json());
    const profile = await requireCanonicalSessionProfile();
    const supabase = await createServerSupabaseClient();

    const details = await supabase.auth.oauth.getAuthorizationDetails(input.authorizationId);
    if (details.error || !details.data) return NextResponse.json({ code: "authorization_invalid", error: "O pedido de autorização expirou. Inicie a conexão de novo." }, { status: 400, ...noStore });
    if (!("authorization_id" in details.data)) return NextResponse.json({ redirectUrl: details.data.redirect_url }, noStore);
    if (details.data.user.id !== profile.userId) return NextResponse.json({ code: "authorization_user_mismatch", error: "Este pedido pertence a outra conta." }, { status: 403, ...noStore });

    if (input.decision === "deny") {
      const denied = await supabase.auth.oauth.denyAuthorization(input.authorizationId);
      if (denied.error || !denied.data) return NextResponse.json({ code: "authorization_deny_failed", error: "Não foi possível recusar o pedido." }, { status: 502, ...noStore });
      return NextResponse.json({ redirectUrl: denied.data.redirect_url }, noStore);
    }

    // Grants primeiro, com readback. Só então o Supabase emite o code.
    const scopes = normalizeWriterMcpScopes(input.scopes);
    const options = await listWriterConsentBrandOptions(profile);
    const brands = normalizeConsentBrandSelection(input.brandIds, options);
    const grants = await createWriterMcpGrants({
      profile, oauthClientId: details.data.client.id, clientName: details.data.client.name, brands, scopes,
    });

    const approved = await supabase.auth.oauth.approveAuthorization(input.authorizationId);
    if (approved.error || !approved.data) {
      return NextResponse.json({ code: "authorization_approve_failed", error: "As Marcas foram registradas, mas o provedor não concluiu a autorização. Tente aprovar de novo." }, { status: 502, ...noStore });
    }
    return NextResponse.json({ redirectUrl: approved.data.redirect_url, grants: grants.length }, noStore);
  } catch (error) {
    return failure(error);
  }
}
