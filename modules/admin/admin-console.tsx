"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Plus } from "lucide-react";
import { GlobalTopbarPageControls } from "@/components/global-topbar";
import { GLOBAL_TOPBAR_ACTION_CONTROL, GLOBAL_TOPBAR_PAGE_TAB, GLOBAL_TOPBAR_PAGE_TAB_ACTIVE, GLOBAL_TOPBAR_PAGE_TABS } from "@/components/global-topbar-control";
import { AdminOverviewPage } from "./admin-overview-page";
import { buildAdminPath, isAdminTab, type AdminTab } from "@/lib/admin-routing";
import BrandsAdminPanel from "./brands-admin-panel";
import AgenciesAdminPanel from "./agencies-admin-panel";
import UsersAdminPanel from "./users-admin-panel";
import CommunicationAdminPanel from "./communication-admin-panel";
import PlatformIntegrationsPanel from "./platform-integrations-panel";

const tabs: Array<{ id: AdminTab; label: string }> = [
  { id: "visao-geral", label: "Visão geral" }, { id: "marcas", label: "Marcas" }, { id: "agencias", label: "Agências" },
  { id: "usuarios", label: "Usuários e acessos" }, { id: "planos", label: "Planos" },
  { id: "consumo", label: "Consumo" }, { id: "configuracoes", label: "Configurações" }, { id: "integracoes", label: "Integrações" },
];

export function AdminConsole() {
  const searchParams = useSearchParams();
  const requested = searchParams.get("tab");
  const tab: AdminTab = isAdminTab(requested) ? requested : "visao-geral";
  const pageTabs = <nav className={GLOBAL_TOPBAR_PAGE_TABS} aria-label="Seções administrativas" data-global-page-tabs>{tabs.map((item) => <Link key={item.id} href={buildAdminPath(item.id)} aria-current={tab === item.id ? "page" : undefined} className={`${GLOBAL_TOPBAR_PAGE_TAB} ${tab === item.id ? GLOBAL_TOPBAR_PAGE_TAB_ACTIVE : ""}`}>{item.label}</Link>)}</nav>;
  const pageActions = tab === "visao-geral" ? <Link href={buildAdminPath("marcas")} className={GLOBAL_TOPBAR_ACTION_CONTROL}><Plus className="h-3 w-3" aria-hidden="true" />Cadastrar nova marca</Link> : null;
  return <div className="min-h-screen bg-background text-foreground">
    <GlobalTopbarPageControls tabs={pageTabs} actions={pageActions}/>
    {tab === "visao-geral" && <AdminOverviewPage />}
    {tab === "marcas" && <BrandsAdminPanel />}
    {tab === "agencias" && <AgenciesAdminPanel />}
    {tab === "usuarios" && <UsersAdminPanel />}
    {tab === "configuracoes" && <CommunicationAdminPanel />}
    {tab === "integracoes" && <PlatformIntegrationsPanel />}
    {tab !== "visao-geral" && tab !== "marcas" && tab !== "agencias" && tab !== "usuarios" && tab !== "configuracoes" && tab !== "integracoes" && <section className="p-6"><h1 className="text-sm font-bold">{tabs.find((item) => item.id === tab)?.label}</h1><p className="mt-2 max-w-xl text-sm text-text-muted">Esta seção depende de entidades de plano e consumo ainda não confirmadas no schema remoto. Nenhum dado foi inventado.</p></section>}
  </div>;
}
