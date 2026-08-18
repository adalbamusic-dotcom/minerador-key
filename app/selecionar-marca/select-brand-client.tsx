"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useSupabaseSession } from "@/components/auth/supabase-session-context";
import { buildTenantPath, type TenantRouteModule } from "@/lib/tenant-routing";

type BrandContext = { id: string; nome: string };
type AgencyContext = { id: string; name: string; agencyRef: string };
type PendingAgencyOnboarding = {
  agencyName: string;
  applicationStatus: "APPROVED";
  invitationStatus: "PENDING";
  onboardingStatus: "NOT_COMPLETED";
  agencyStatus: "NOT_CREATED";
};
type ContextIndex = {
  isPlatformAdmin: boolean;
  brands: BrandContext[];
  operationalAgency: AgencyContext | null;
  agencies: AgencyContext[];
  pendingOnboarding: PendingAgencyOnboarding | null;
};

const tenantModules: TenantRouteModule[] = ["marca", "conta", "minerador", "arquiteto", "radar", "planejador", "redator", "publicacoes"];
const platformAdminLabel = "Administração global";
const agencyLabel = "Minha Agência";
const noBrandAccessLabel = "Você ainda não possui acesso editorial a uma marca. Este é um estado válido: aguarde um convite ou vínculo explícito.";

function moduleFromContinuation(value: string): TenantRouteModule {
  const candidate = value.replace(/^\/+/, "").split("?")[0] as TenantRouteModule;
  return tenantModules.includes(candidate) ? candidate : "marca";
}

function destinationForBrand(brand: BrandContext, continuation: string) {
  const path = continuation.startsWith("/") ? continuation : "/";
  const [pathname, query] = path.split("?");
  const target = buildTenantPath({ brandId: brand.id, brandName: brand.nome, module: moduleFromContinuation(pathname) });
  return query ? `${target}?${query}` : target;
}

function PendingOnboardingNotice({ pending }: { pending: PendingAgencyOnboarding }) {
  return <section aria-labelledby="pending-onboarding" className="rounded-lg border border-amber-500/35 bg-amber-500/10 p-4 sm:p-5">
    <p className="text-sm font-semibold text-amber-200">Acesso aprovado</p>
    <h2 id="pending-onboarding" className="mt-1 text-lg font-semibold text-foreground">Finalize o acesso à agência</h2>
    <p className="mt-2 max-w-2xl text-sm leading-6 text-foreground/75">Sua identidade já está confirmada. Conclua o onboarding para criar a agência e acessar o workspace.</p>
    <Link href="/onboarding/agencia" className="mt-4 inline-flex min-h-11 items-center justify-center rounded-md bg-accent px-4 text-sm font-semibold text-foreground transition-colors hover:bg-accent/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">Finalizar acesso à agência</Link>
    <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
      <div><dt className="text-foreground/60">Solicitação</dt><dd className="mt-1 font-semibold text-foreground">Aprovada</dd></div>
      <div><dt className="text-foreground/60">Convite</dt><dd className="mt-1 font-semibold text-foreground">Pendente</dd></div>
      <div><dt className="text-foreground/60">Agência</dt><dd className="mt-1 font-semibold text-foreground">Ainda não criada</dd></div>
    </dl>
    <p className="mt-4 text-sm leading-6 text-foreground/70">Agência: <strong className="text-foreground">{pending.agencyName}</strong>.</p>
  </section>;
}

export function SelectBrandClient() {
  const { data: session, signOut } = useSupabaseSession();
  const [contexts, setContexts] = useState<ContextIndex | null>(null);
  const [error, setError] = useState("");
  const continuation = typeof window === "undefined" ? "/" : new URLSearchParams(window.location.search).get("continuar") || "/";

  useEffect(() => {
    let active = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setContexts(null);
    setError("");
    if (!session?.user.id) return () => { active = false; };
    void fetch("/api/contexts", { cache: "no-store" }).then(async (response) => {
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Não foi possível carregar seus contextos.");
      if (active) setContexts({
        isPlatformAdmin: body.isPlatformAdmin === true,
        brands: Array.isArray(body.brands) ? body.brands : [],
        operationalAgency: body.operationalAgency && typeof body.operationalAgency === "object" ? body.operationalAgency : null,
        agencies: Array.isArray(body.agencies) ? body.agencies : [],
        pendingOnboarding: body.pendingOnboarding && typeof body.pendingOnboarding === "object" ? body.pendingOnboarding : null,
      });
    }).catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : "Não foi possível carregar seus contextos."); });
    return () => { active = false; };
  }, [session?.user.id]);

  return <main className="min-h-screen bg-background p-4 text-foreground sm:p-6"><section className="mx-auto max-w-2xl space-y-6 rounded-xl border border-foreground/15 bg-foreground/5 p-5 sm:p-6">
    <header><p className="text-sm font-medium text-accent">Contextos autorizados</p><h1 className="mt-2 text-2xl font-semibold tracking-tight">Escolha onde deseja trabalhar</h1><p className="mt-2 text-base leading-7 text-foreground/70">Cada abertura é confirmada no servidor. Nenhum contexto é escolhido por armazenamento local, histórico ou primeiro registro.</p></header>
    {error ? <p role="alert" className="rounded-md border border-red-500/35 bg-red-500/10 px-3 py-2 text-sm leading-6 text-foreground">{error}</p> : null}
    {!contexts && !error ? <p role="status" className="text-sm text-foreground/70">Carregando contextos autorizados...</p> : null}
    {contexts?.isPlatformAdmin ? <section aria-labelledby="context-admin"><h2 id="context-admin" className="text-lg font-semibold">{platformAdminLabel}</h2><p className="mt-1 text-sm leading-6 text-foreground/70">Administre a plataforma sem receber acesso editorial a marcas automaticamente.</p><Link href="/admin" className="mt-3 inline-flex min-h-10 items-center rounded-md border border-foreground/20 px-3 text-sm font-semibold text-foreground transition-colors hover:bg-foreground/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">Abrir {platformAdminLabel}</Link></section> : null}
    {contexts?.pendingOnboarding ? <PendingOnboardingNotice pending={contexts.pendingOnboarding} /> : null}
    {contexts ? <section aria-labelledby="context-agency"><h2 id="context-agency" className="text-lg font-semibold">{agencyLabel}</h2>{contexts.operationalAgency ? <Link href={`/agencias/${contexts.operationalAgency.agencyRef}`} className="mt-3 flex min-h-11 items-center rounded-md border border-foreground/20 px-3 text-sm font-medium transition-colors hover:bg-foreground/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">Abrir {contexts.operationalAgency.name}</Link> : <p className="mt-2 text-sm leading-6 text-foreground/60">Nenhuma Agency operacional confirmada para esta identidade.</p>}</section> : null}
    {contexts ? <section aria-labelledby="context-brands"><h2 id="context-brands" className="text-lg font-semibold">Marcas</h2>{contexts.brands.length ? <div className="mt-3 grid gap-2">{contexts.brands.map((brand) => <Link key={brand.id} href={destinationForBrand(brand, continuation)} className="flex min-h-11 items-center rounded-md border border-foreground/20 px-3 text-sm font-medium transition-colors hover:bg-foreground/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">{brand.nome}</Link>)}</div> : <p className="mt-2 text-sm leading-6 text-foreground/60">{noBrandAccessLabel}</p>}</section> : null}
    {contexts && !contexts.isPlatformAdmin && !contexts.operationalAgency && !contexts.brands.length ? <button type="button" onClick={() => signOut("/login")} className="inline-flex min-h-10 items-center rounded-md border border-foreground/20 px-3 text-sm font-semibold text-foreground transition-colors hover:bg-foreground/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">Sair da conta</button> : null}
  </section></main>;
}
