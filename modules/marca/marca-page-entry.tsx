"use client";

import Link from "next/link";
import { useState } from "react";
import { BrandPage } from "./brand-page";
import { useBrand } from "@/components/brand-context";
import { SiteSitemapPanel } from "./site-sitemap-panel";
import { normalizeSiteUrl } from "@/lib/marca/site-domain";
import { buildTenantPath } from "@/lib/tenant-routing";

const btn = "inline-flex h-8 items-center rounded border border-indigo-900 bg-indigo-950/30 px-3 text-[10px] font-bold text-indigo-300 hover:bg-indigo-950/60";
const tabs = [["visao", "Visão geral"], ["site", "Site e Sitemap"], ["dna", "DNA"], ["materiais", "Materiais"], ["skills", "Skills e prompts"], ["equipe", "Equipe"], ["configuracoes", "Configurações"]] as const;

export function MarcaPageEntry({ initialSection = "visao", initialPanel }: { initialSection?: string; initialPanel?: string }) {
  const { activeBrand, refreshBrands } = useBrand();
  const marcaPath = activeBrand ? buildTenantPath({ brandId: activeBrand.id, brandName: activeBrand.nome, module: "marca" }) : "/selecionar-marca";
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const saveSiteUrl = async (siteUrl: string) => {
    if (!activeBrand) throw new Error("Nenhuma marca ativa.");
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch("/api/marcas", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: activeBrand.id,
          nome: activeBrand.nome,
          site_url: normalizeSiteUrl(siteUrl),
          nicho: activeBrand.nicho,
          localizacao: activeBrand.localizacao,
          dna_diretrizes: activeBrand.dna_diretrizes,
          silos_existentes: activeBrand.silos_existentes,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Não foi possível salvar o endereço.");
      await refreshBrands();
      setMessage("Configuração do site salva.");
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Não foi possível salvar o endereço.";
      setMessage(detail);
      throw new Error(detail);
    } finally {
      setSaving(false);
    }
  };

  if (initialSection !== "site") return <BrandPage initialSection={initialSection}/>;

  return <div className="flex h-screen min-h-0 w-full min-w-0 flex-col bg-[#07080b] text-slate-200">
    <header className="sticky top-0 z-40 flex min-h-12 items-center justify-between gap-3 border-b border-slate-900 bg-[#07080b]/95 px-3 backdrop-blur">
      <div className="min-w-0"><p className="truncate text-[8px] font-bold uppercase tracking-[.2em] text-indigo-400">{activeBrand?.nome || "Sem marca"}</p><h1 className="text-sm font-bold text-white">Marca · Site e Sitemap</h1></div>
      <Link className="text-[10px] text-slate-500 hover:text-slate-200" href={`${marcaPath}?secao=visao`}>Voltar para Marca</Link>
    </header>
    <main className="min-h-0 w-full min-w-0 max-w-none flex-1 overflow-y-auto p-3">
      <nav aria-label="Seções da Marca" className="mb-3 flex flex-wrap gap-1">{tabs.map(([id, label]) => <Link key={id} href={`${marcaPath}?secao=${id}${id === "site" && initialPanel ? `&painel=${encodeURIComponent(initialPanel)}` : ""}`} className={`${btn} ${id === "site" ? "border-indigo-500 text-white" : "border-slate-800 text-slate-500"}`}>{label}</Link>)}</nav>
      {message && <p role="status" className="mb-3 rounded border border-amber-900/40 bg-amber-950/20 p-2 text-[10px] text-amber-300">{message}</p>}
      {activeBrand ? <SiteSitemapPanel brandId={activeBrand.id} siteUrl={activeBrand.site_url || ""} saving={saving} initialPanel={initialPanel} onSave={saveSiteUrl}/> : <p className="text-xs text-slate-500">Selecione uma marca autorizada para configurar o site.</p>}
    </main>
  </div>;
}
