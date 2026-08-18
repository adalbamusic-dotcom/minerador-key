"use client";

import Link from "next/link";
import { useState } from "react";
import { useBrand } from "@/components/brand-context";
import { GlobalTopbarPageControls } from "@/components/global-topbar";
import { GLOBAL_TOPBAR_PAGE_TAB, GLOBAL_TOPBAR_PAGE_TAB_ACTIVE, GLOBAL_TOPBAR_PAGE_TABS } from "@/components/global-topbar-control";
import { SiteSitemapPanel } from "./site-sitemap-panel";
import { BrandPage } from "./brand-page";
import { normalizeSiteUrl } from "@/lib/marca/site-domain";
import { buildTenantPath } from "@/lib/tenant-routing";

const tabs = [["visao", "Visão geral"], ["site", "Site e Sitemap"], ["dna", "BrandDNA"], ["materiais", "Materiais"], ["skills", "Skills e prompts"], ["equipe", "Equipe"], ["configuracoes", "Configurações"]] as const;

export function MarcaPageEntry({ initialSection = "visao", initialPanel }: { initialSection?: string; initialPanel?: string }) {
  const { activeBrand, refreshBrands } = useBrand();
  const marcaPath = activeBrand ? buildTenantPath({ brandId: activeBrand.id, brandName: activeBrand.nome, module: "marca" }) : "/selecionar-marca";
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const saveSiteUrl = async (siteUrl: string) => {
    if (!activeBrand) throw new Error("Nenhuma marca ativa.");
    setSaving(true); setMessage("");
    try {
      const response = await fetch("/api/marcas", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: activeBrand.id, nome: activeBrand.nome, site_url: normalizeSiteUrl(siteUrl), nicho: activeBrand.nicho, localizacao: activeBrand.localizacao, dna_diretrizes: activeBrand.dna_diretrizes, silos_existentes: activeBrand.silos_existentes }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Não foi possível salvar o endereço.");
      await refreshBrands(); setMessage("Configuração do site salva.");
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Não foi possível salvar o endereço.";
      setMessage(detail); throw new Error(detail);
    } finally { setSaving(false); }
  };

  const pageTabs = <nav aria-label="Seções da marca" className={GLOBAL_TOPBAR_PAGE_TABS} data-global-page-tabs>{tabs.map(([id, label]) => <Link key={id} href={`${marcaPath}?secao=${id}${id === "site" && initialPanel ? `&painel=${encodeURIComponent(initialPanel)}` : ""}`} aria-current={id === "site" ? "page" : undefined} className={`${GLOBAL_TOPBAR_PAGE_TAB} ${id === "site" ? GLOBAL_TOPBAR_PAGE_TAB_ACTIVE : ""}`}>{label}</Link>)}</nav>;

  if (initialSection !== "site") return <BrandPage initialSection={initialSection}/>;

  return <><GlobalTopbarPageControls tabs={pageTabs}/><main className="mx-auto min-h-0 max-w-7xl space-y-6 overflow-y-auto p-4 sm:p-6 lg:p-8"><div><h1 className="text-2xl font-semibold tracking-tight text-foreground">Site e Sitemap</h1><p className="mt-2 max-w-3xl text-base leading-7 text-text-muted">Cadastre o domínio principal, sincronize sitemaps e revise conteúdos antes de qualquer importação.</p></div>{message && <p role="status" aria-live="polite" className="rounded-md border border-warning/35 bg-warning-soft px-4 py-3 text-sm leading-6 text-warning">{message}</p>}{activeBrand ? <SiteSitemapPanel brandId={activeBrand.id} siteUrl={activeBrand.site_url || ""} saving={saving} initialPanel={initialPanel} onSave={saveSiteUrl}/> : <p className="rounded-md border border-divider bg-surface-subtle py-6 text-base text-text-muted">Selecione uma marca autorizada para configurar o site.</p>}</main></>;
}
