import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { WorkspaceFrame } from "@/components/workspace-frame";
import { CanonicalAuthorizationError } from "@/lib/tenant/canonical-authorization";
import { getAgencyWorkspaceData } from "@/lib/server/agency-workspace";
import { SupabaseSessionError } from "@/lib/server/supabase-session";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AgencyWorkspaceLayout({ children, params }: { children: ReactNode; params: Promise<unknown> }) {
  const { agencyRef } = await params as { agencyRef: string };
  let workspace: Awaited<ReturnType<typeof getAgencyWorkspaceData>>;
  try {
    workspace = await getAgencyWorkspaceData(agencyRef);
  } catch (error) {
    if (error instanceof SupabaseSessionError) redirect(`/login?callbackUrl=${encodeURIComponent(`/agencias/${agencyRef}`)}`);
    if (error instanceof CanonicalAuthorizationError && error.status === 401) redirect(`/login?callbackUrl=${encodeURIComponent(`/agencias/${agencyRef}`)}`);
    if (error instanceof CanonicalAuthorizationError && (error.status === 403 || error.status === 404)) {
      return <main className="grid min-h-screen place-items-center bg-background p-6 text-foreground"><section className="max-w-lg rounded-xl border border-foreground/15 bg-foreground/5 p-6"><h1 className="text-xl font-semibold">Área da agência não disponível</h1><p className="mt-3 leading-7 text-foreground/70">A referência ou o acesso operacional informado não foi confirmado. Nenhum outro contexto será escolhido automaticamente.</p></section></main>;
    }
    throw error;
  }
  return <WorkspaceFrame agencyRef={workspace.agency.agencyRef} agencyName={workspace.agency.name} isGlobalAdmin={workspace.isGlobalAdmin}>{children}</WorkspaceFrame>;
}
