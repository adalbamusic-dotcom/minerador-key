"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, type CSSProperties } from "react";
import { useSupabaseSession } from "@/components/auth/supabase-session-context";
import { Building2, ChevronDown, ChevronLeft, ChevronRight, CircleUser, FilePenLine, Gauge, Key, Library, Menu, Network, Radar, Shield, Sparkles, Store, X } from "lucide-react";
import { PRODUCT_FLOW, menuEntriesForRole, type ProductModule } from "@/lib/editorial/navigation";
import { useBrand } from "./brand-context";
import type { TenantContext } from "@/lib/server/tenant-context";
import { buildTenantPath, parseBrandRef, switchTenantPath, type TenantRouteModule } from "@/lib/tenant-routing";
import { parseAgencyRef } from "@/lib/agency-routing";
import { buildAdminPath } from "@/lib/admin-routing";
import { buildGlobalNavigationContext, writeGlobalNavigationContext } from "@/lib/navigation/global-context";
import { NewSessionSlotLink } from "@/components/auth/new-session-slot-link";
import { SessionLogoutButton } from "@/components/auth/session-logout-button";
import { useShellVisual } from "@/components/shell-visual-context";
import { GlobalTopbar, GlobalTopbarControlsProvider } from "@/components/global-topbar";

const icons: Record<ProductModule, typeof Building2> = {
  admin: Shield,
  marca: Store,
  minerador: Key,
  arquiteto: Network,
  radar: Radar,
  planejador: Gauge,
  redator: FilePenLine,
  publicacoes: Library,
  conta: CircleUser,
};

type OperationalAgency = { id: string; name: string; agencyRef: string };
const operationalAgencyCache = new Map<string, OperationalAgency | null>();

function currentBrandRef(pathname: string) {
  const candidate = pathname.match(/^\/([^/]+)/)?.[1];
  if (!candidate) return null;
  try {
    parseBrandRef(candidate);
    return candidate;
  } catch {
    return null;
  }
}

function currentAgencyId(pathname: string) {
  const candidate = pathname.match(/^\/agencias\/([^/]+)/)?.[1];
  if (!candidate) return null;
  try {
    return parseAgencyRef(candidate).agencyId;
  } catch {
    return null;
  }
}

export function ProductShell({ children, tenant }: { children: React.ReactNode; tenant?: TenantContext }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { data: session } = useSupabaseSession();
  const { brands, selectedBrandId, setSelectedBrandId, userRole, profileLoading } = useBrand();
  const { expanded, setExpandedPreference, initialOperationalBrand } = useShellVisual();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [brandSelectorOpen, setBrandSelectorOpen] = useState(false);
  const [operationalAgencyState, setOperationalAgencyState] = useState<{ actorUserId: string | null; value: OperationalAgency | null }>({ actorUserId: null, value: null });
  const actorUserId = session?.user?.id || null;
  const cachedOperationalAgency = actorUserId && operationalAgencyCache.has(actorUserId) ? operationalAgencyCache.get(actorUserId) || null : null;
  const operationalAgency = actorUserId && operationalAgencyState.actorUserId === actorUserId ? operationalAgencyState.value : cachedOperationalAgency;
  const selectedOperationalBrand = brands.find((brand) => brand.id === selectedBrandId)
    || (initialOperationalBrand?.id === selectedBrandId ? initialOperationalBrand : null);
  const availableBrands = brands.length ? brands : initialOperationalBrand ? [initialOperationalBrand] : [];
  const currentRouteContext = tenant ? { brandId: tenant.brandId, brandName: tenant.brandName } : null;
  const selectedBrand = selectedOperationalBrand;
  const currentName = currentRouteContext?.brandName || selectedBrand?.nome || (profileLoading ? "Carregando contexto..." : "Nenhuma marca selecionada");
  const isGlobalAdmin = tenant?.isGlobalAdmin || userRole === "admin";
  const isAdminSurface = pathname.startsWith("/admin");
  const isAgencySurface = pathname.startsWith("/agencias/");
  const entries = menuEntriesForRole(isGlobalAdmin ? "admin" : userRole)
    .filter((item) => PRODUCT_FLOW.includes(item.id as Exclude<ProductModule, "conta" | "admin">))
    .filter((item) => !tenant || item.id === "marca" || tenant.permissions.includes(`${item.id}:view`));

  const moduleHref = (module: TenantRouteModule) => {
    const brand = currentRouteContext || (selectedOperationalBrand ? { brandId: selectedOperationalBrand.id, brandName: selectedOperationalBrand.nome } : null);
    return brand ? buildTenantPath({ ...brand, module }) : null;
  };

  const navigationEntries = entries.map((item) => ({ ...item, href: currentRouteContext || selectedOperationalBrand ? moduleHref(item.id as TenantRouteModule) : null }));
  const switchBrand = (brandId: string) => {
    const targetBrand = availableBrands.find((brand) => brand.id === brandId);
    if (!targetBrand) return;
    setSelectedBrandId(brandId);
    setBrandSelectorOpen(false);
    setMobileOpen(false);
    router.push(switchTenantPath({ targetBrand: { brandId, brandName: targetBrand.nome }, pathname, search: searchParams.toString() }));
  };

  useEffect(() => {
    let active = true;
    if (!actorUserId) {
      return () => { active = false; };
    }
    void fetch("/api/contexts", { cache: "no-store" })
      .then(async (response) => (response.ok ? response.json() : null))
      .then((body) => {
        const nextAgency = body?.operationalAgency && typeof body.operationalAgency === "object" ? body.operationalAgency as OperationalAgency : null;
        operationalAgencyCache.set(actorUserId, nextAgency);
        if (active) setOperationalAgencyState({ actorUserId, value: nextAgency });
      })
      .catch(() => {
        operationalAgencyCache.set(actorUserId, null);
        if (active) setOperationalAgencyState({ actorUserId, value: null });
      });
    return () => { active = false; };
  }, [actorUserId]);

  useEffect(() => {
    const actorUserId = session?.user?.id;
    if (!actorUserId || profileLoading) return;
    const snapshot = buildGlobalNavigationContext({
      pathname,
      search: searchParams.toString(),
      brandId: tenant?.brandId || selectedOperationalBrand?.id,
      brandRef: currentBrandRef(pathname),
      agencyId: currentAgencyId(pathname) || operationalAgency?.id,
      agencyRef: pathname.startsWith("/agencias/") ? pathname.split("/")[2] : operationalAgency?.agencyRef,
    });
    if (snapshot) writeGlobalNavigationContext(actorUserId, snapshot);
  }, [operationalAgency, pathname, profileLoading, searchParams, selectedOperationalBrand?.id, session?.user?.id, tenant?.brandId]);

  const closeMobile = () => setMobileOpen(false);
  const toggleExpanded = () => {
    setBrandSelectorOpen(false);
    setExpandedPreference(!expanded);
  };
  const shellColumns = expanded ? "lg:grid-cols-[15rem_minmax(0,1fr)]" : "lg:grid-cols-[3.5rem_minmax(0,1fr)]";

  const shellStyle = { "--minerador-sidebar-width": expanded ? "15rem" : "3.5rem" } as CSSProperties;

  return <div data-product-shell style={shellStyle} className={`min-h-screen bg-background text-foreground lg:grid ${shellColumns}`}>
    <button type="button" onClick={() => setMobileOpen(true)} className="fixed left-3 top-3 z-40 inline-flex min-h-10 min-w-10 items-center justify-center rounded-md border border-divider bg-background px-2 text-foreground shadow-sm lg:hidden" aria-label="Abrir navegação principal">
      <Menu className="h-5 w-5" aria-hidden="true" />
    </button>
    {mobileOpen ? <button type="button" onClick={closeMobile} className="fixed inset-0 z-40 bg-foreground/20 lg:hidden" aria-label="Fechar navegação" /> : null}
    <aside className={`fixed inset-y-0 left-0 z-50 flex w-64 -translate-x-full flex-col border-r border-divider bg-background transition-transform lg:sticky lg:top-0 lg:z-auto lg:h-screen lg:w-auto lg:translate-x-0 ${mobileOpen ? "translate-x-0" : ""}`} aria-label="Navegação principal">
      <div className="flex h-10 min-h-10 items-center justify-between border-b border-divider px-3">
        <button type="button" onClick={toggleExpanded} className="inline-flex min-h-10 min-w-10 items-center gap-2 rounded-md px-2 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-context-accent" aria-label={expanded ? "Recolher menu" : "Expandir menu"}>
          <Sparkles className="h-5 w-5 shrink-0 text-context-accent" aria-hidden="true" />
          {expanded ? <span className="truncate">Minerador Key</span> : null}
        </button>
        <button type="button" onClick={closeMobile} className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-md text-foreground/60 hover:bg-foreground/5 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-context-accent lg:hidden" aria-label="Fechar navegação">
          <X className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="border-b border-divider p-2">
          <div className="space-y-1">
            {expanded ? <p className="text-sm font-semibold text-foreground/60">Marca atual</p> : <span className="sr-only">Marca atual</span>}
            {availableBrands.length ? <button type="button" onClick={() => {
              if (!expanded) {
                setExpandedPreference(true);
                setBrandSelectorOpen(true);
                return;
              }
              setBrandSelectorOpen((value) => !value);
            }} className={`inline-flex min-h-10 items-center gap-2 rounded-md text-sm font-semibold text-foreground hover:bg-foreground/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-context-accent ${expanded ? "w-full justify-start px-2" : "w-full justify-center"}`} aria-expanded={brandSelectorOpen} aria-haspopup="listbox" title={currentName}>
              <Store className="h-4 w-4 shrink-0 text-context-accent" aria-hidden="true" />
              {expanded ? <><span className="truncate">{currentName}</span><ChevronDown className="h-4 w-4 shrink-0" aria-hidden="true" /></> : null}
            </button> : null}
          </div>
          {expanded && brandSelectorOpen && availableBrands.length ? <div className="mt-2 space-y-1 rounded-md border border-divider bg-foreground/5 p-1" role="listbox" aria-label="Marcas autorizadas">
            {availableBrands.map((brand) => <button type="button" key={brand.id} onClick={() => switchBrand(brand.id)} role="option" aria-selected={brand.id === selectedBrandId} className="flex min-h-10 w-full items-center rounded-md px-2 text-left text-sm text-foreground/75 hover:bg-foreground/10 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-context-accent">
              <span className="truncate">{brand.nome}</span>
            </button>)}
          </div> : null}
        </div>

        <nav className="space-y-1 p-2" aria-label="Áreas da plataforma">
          {operationalAgency ? <Link href={`/agencias/${operationalAgency.agencyRef}`} onClick={closeMobile} aria-current={isAgencySurface ? "page" : undefined} title={!expanded ? "Minha Agência" : undefined} className={`flex min-h-11 items-center gap-3 rounded-md px-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-context-accent ${isAgencySurface ? "bg-foreground/10 text-foreground" : "text-foreground/75 hover:bg-foreground/5 hover:text-foreground"}`}>
            <Building2 className="h-5 w-5 shrink-0 text-context-accent" aria-hidden="true" />
            {expanded ? <span className="truncate">Minha Agência</span> : null}
          </Link> : null}
          {expanded ? <p className="px-3 pb-1 pt-3 text-sm font-semibold text-foreground/50">Áreas</p> : null}
          {navigationEntries.map((item) => {
            const Icon = icons[item.id];
            const active = item.id === "marca" ? pathname === item.href || pathname === `${item.href}/` : pathname === item.href || pathname.startsWith(`${item.href}/`);
            return item.href ? <Link key={item.id} href={item.href} onClick={closeMobile} aria-current={active ? "page" : undefined} title={!expanded ? item.label : undefined} className={`flex min-h-10 items-center gap-3 rounded-md px-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-context-accent ${active ? "bg-foreground/10 text-foreground" : "text-foreground/75 hover:bg-foreground/5 hover:text-foreground"}`}>
              <Icon className="h-5 w-5 shrink-0 text-module-accent" aria-hidden="true" />
              {expanded ? <span>{item.label}</span> : null}
            </Link> : <div key={item.id} className="flex min-h-10 items-center gap-3 rounded-md px-3 text-sm font-semibold text-foreground/35" aria-disabled="true" title={profileLoading ? "Contexto carregando" : "Nenhuma marca autorizada"}>
              <Icon className="h-5 w-5 shrink-0 text-module-accent/50" aria-hidden="true" />
              {expanded ? <span>{item.label}</span> : null}
            </div>;
          })}
        </nav>

        <nav className="space-y-1 border-t border-divider p-2" aria-label="Outros contextos">
          {expanded ? <p className="px-3 pb-1 pt-1 text-sm font-semibold text-foreground/50">Outros</p> : null}
          <Link href="/conta" onClick={closeMobile} aria-current={pathname.startsWith("/conta") ? "page" : undefined} title={!expanded ? "Conta" : undefined} className={`flex min-h-11 items-center gap-3 rounded-md px-3 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-context-accent ${pathname.startsWith("/conta") ? "bg-foreground/10 text-foreground" : "text-foreground/75 hover:bg-foreground/5 hover:text-foreground"}`}>
            <CircleUser className="h-5 w-5 shrink-0 text-context-accent" aria-hidden="true" />
            {expanded ? <span className="truncate">Perfil</span> : null}
          </Link>
          {isGlobalAdmin ? <Link href={buildAdminPath()} onClick={closeMobile} aria-current={isAdminSurface ? "page" : undefined} title={!expanded ? "Admin global" : undefined} className={`flex min-h-11 items-center gap-3 rounded-md px-3 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-context-accent ${isAdminSurface ? "bg-foreground/10 text-foreground" : "text-foreground/75 hover:bg-foreground/5 hover:text-foreground"}`}>
            <Shield className="h-5 w-5 shrink-0 text-context-accent" aria-hidden="true" />
            {expanded ? <span>Painel Admin</span> : null}
          </Link> : null}
        </nav>
      </div>

      <div className="border-t border-divider p-2">
        {expanded ? <div className="px-2 pb-1 text-sm text-foreground/60">{session?.user?.email || "Sessão autenticada"}</div> : null}
        {expanded ? <div className="px-1 pb-1"><NewSessionSlotLink next={`${pathname}${searchParams.toString() ? `?${searchParams.toString()}` : ""}`} label="Entrar em outra conta" /></div> : null}
        <SessionLogoutButton compact={!expanded} className="w-full justify-start text-danger hover:bg-foreground/5" label="Sair da conta" />
      </div>
      <div className="group absolute -right-5 top-1/2 z-20 hidden min-h-10 min-w-10 -translate-y-1/2 lg:block">
        <button type="button" onClick={toggleExpanded} className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-md border border-divider bg-background text-foreground/60 opacity-0 shadow-sm group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-context-accent" aria-label={expanded ? "Recolher menu" : "Expandir menu"}>
          {expanded ? <ChevronLeft className="h-5 w-5" aria-hidden="true" /> : <ChevronRight className="h-5 w-5" aria-hidden="true" />}
        </button>
      </div>
    </aside>
    <GlobalTopbarControlsProvider>
      <main className="min-h-screen min-w-0 bg-background">
        <GlobalTopbar />
        {children}
      </main>
    </GlobalTopbarControlsProvider>
  </div>;
}
