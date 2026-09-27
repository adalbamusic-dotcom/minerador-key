import { redirect } from "next/navigation";
import { PersonalAccountPage } from "@/modules/conta/personal-account-page";
import { CanonicalAuthorizationError } from "@/lib/tenant/canonical-authorization";
import { requireCanonicalSessionProfile } from "@/lib/server/authz";
import { getCanonicalPersonalAccount } from "@/lib/server/personal-account";
import { SupabaseSessionError } from "@/lib/server/supabase-session";
import { loadWriterMcpConnectionsForAccount } from "@/lib/server/writer-mcp-grants";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/** O link de reconsentimento do MCP traz ?mcp_client; o login não pode perdê-lo. */
function loginRedirectFor(mcpClient: string | string[] | undefined) {
  const id = typeof mcpClient === "string" ? mcpClient.trim() : "";
  const valido = id.length >= 1 && id.length <= 200 && !/\s/.test(id);
  if (!valido) return "/login?callbackUrl=%2Fconta";
  return `/login?callbackUrl=${encodeURIComponent(`/conta?mcp_client=${encodeURIComponent(id)}`)}`;
}

export default async function PersonalAccountRoute({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  let account: Awaited<ReturnType<typeof getCanonicalPersonalAccount>>;
  try {
    account = await getCanonicalPersonalAccount();
  } catch (error) {
    if ((error instanceof CanonicalAuthorizationError && error.status === 401) || error instanceof SupabaseSessionError) {
      redirect(loginRedirectFor((await searchParams).mcp_client));
    }
    throw error;
  }
  // A sessão já foi validada acima; o perfil aqui só carrega o papel global para as conexões de IA.
  const aiConnections = await loadWriterMcpConnectionsForAccount(await requireCanonicalSessionProfile());
  return <PersonalAccountPage identity={account.identity} brands={account.brands} agencies={account.agencies} isPlatformAdmin={account.isPlatformAdmin} aiConnections={aiConnections} />;
}
