"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { internalSurface } from "@/components/editorial/internal-page-visual";
import { useNoticeBridge } from "@/components/global-notice-center";

type Brand = { id: string; nome: string; status: string; agencyName?: string | null };

export default function BrandsAdminPanel() {
  const [brands, setBrands] = useState<Brand[]>([]); const [loading, setLoading] = useState(true); const [error, setError] = useState("");
  useNoticeBridge({ notice: error, module: "admin", area: "Marcas", title: "Administração · Marcas", fallbackSeverity: "ERROR" });
  useEffect(() => { const timer = window.setTimeout(async () => { try { const response = await fetch("/api/marcas", { cache: "no-store" }); const body = await response.json().catch(() => ({})); if (!response.ok) throw new Error(body.error || "Não foi possível carregar as marcas."); setBrands(body.brands || []); } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível carregar as marcas."); } finally { setLoading(false); } }, 0); return () => window.clearTimeout(timer); }, []);
  return <main className="min-w-0 p-4 sm:p-6"><p className="max-w-3xl text-sm leading-6 text-text-muted">Monitoramento estrutural global. O cadastro operacional pertence à agência no onboarding de marcas.</p>{error ? <p role="alert" className="mt-4 rounded-md border border-danger/35 bg-danger-soft p-3 text-sm text-danger">{error}</p> : null}<section className={`${internalSurface} mt-5`}><h2 className="text-lg font-semibold text-foreground">Marcas cadastradas</h2>{loading ? <p className="mt-4 flex items-center gap-2 text-sm text-text-muted"><Loader2 className="h-4 w-4 animate-spin" />Carregando…</p> : <div className="mt-4 divide-y divide-divider">{brands.map((brand) => <div key={brand.id} className="flex flex-wrap justify-between gap-3 border-divider py-3 text-sm"><span className="font-medium text-foreground">{brand.nome}</span><span className="text-text-muted">{brand.agencyName || "Sem agência ativa"} · {brand.status}</span></div>)}{brands.length === 0 ? <p className="text-sm text-text-muted">Nenhuma marca cadastrada.</p> : null}</div>}</section></main>;
}
