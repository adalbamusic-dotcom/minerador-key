import { notFound, redirect } from "next/navigation";
import { canonicalProfileForVerifiedUser } from "@/lib/server/authz";
import { readMcpRuntimeConfig } from "@/lib/server/mcp-runtime-config";
import { listWriterConsentBrandOptions } from "@/lib/server/writer-mcp-grants";
import { createServerSupabaseClient } from "@/lib/supabase/server-client";
import { OAuthConsentForm } from "@/modules/conta/oauth-consent-form";

/*
 * TELA DE CONSENTIMENTO DO OAUTH SERVER DO SUPABASE.
 *
 * O Supabase valida o pedido do cliente (client_id, redirect_uri, PKCE) e
 * redireciona para cá com `authorization_id`. Esta página só mostra quem pede
 * acesso e deixa o usuário escolher Marcas e permissões; a decisão é gravada em
 * `writer_mcp_grants` e só depois o Supabase é avisado para emitir o code.
 */
export const dynamic = "force-dynamic";
export const revalidate = 0;

const AUTHORIZATION_ID = /^[A-Za-z0-9_-]{8,200}$/;

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return <main className="mx-auto max-w-xl p-5 sm:p-8">
    <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
    <div className="mt-5">{children}</div>
  </main>;
}

export default async function OAuthConsentPage({ searchParams }: { searchParams: Promise<{ authorization_id?: string }> }) {
  const runtime = readMcpRuntimeConfig();
  if (!runtime.oauthEnabled) notFound();

  const { authorization_id: authorizationId } = await searchParams;
  if (!authorizationId || !AUTHORIZATION_ID.test(authorizationId)) {
    return <Shell title="Pedido de autorização inválido"><p className="text-sm leading-6 text-text-muted">Abra a conexão novamente a partir do aplicativo que pediu acesso.</p></Shell>;
  }

  const supabase = await createServerSupabaseClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    redirect(`/login?callbackUrl=${encodeURIComponent(`/oauth/consent?authorization_id=${authorizationId}`)}`);
  }

  const details = await supabase.auth.oauth.getAuthorizationDetails(authorizationId);
  if (details.error || !details.data) {
    return <Shell title="Pedido de autorização expirado"><p className="text-sm leading-6 text-text-muted">O pedido não é mais válido. Volte ao aplicativo e inicie a conexão de novo.</p></Shell>;
  }
  // Consentimento já memorizado pelo Supabase: o cliente precisa do code agora.
  // Marcas e permissões continuam sendo o que está em writer_mcp_grants.
  if (!("authorization_id" in details.data)) redirect(details.data.redirect_url);

  const profile = await canonicalProfileForVerifiedUser(userData.user.id);
  const brands = await listWriterConsentBrandOptions(profile);

  return <Shell title="Autorizar acesso ao Redator">
    <OAuthConsentForm
      authorizationId={details.data.authorization_id}
      client={{ id: details.data.client.id, name: details.data.client.name, uri: details.data.client.uri || null }}
      redirectUri={details.data.redirect_uri}
      userEmail={details.data.user.email || userData.user.email || null}
      brands={brands}
    />
  </Shell>;
}
