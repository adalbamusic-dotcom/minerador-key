"use client";

import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { useBrand } from "@/components/brand-context";
import { buildAdminPath } from "@/lib/admin-routing";
import { internalButton, internalSurfaceSubtle } from "@/components/editorial/internal-page-visual";

export function AdminOverviewPage() {
  const { brands } = useBrand();
  const metrics = [["Empresas administradas", brands.length], ["Acessos delegados", 0], ["Alertas", 0], ["Falhas", 0]] as const;
  return <main className="p-4"><p className="mb-4 max-w-3xl text-sm leading-6 text-text-muted">Controle da plataforma, empresas e acessos delegados.</p><div className="grid gap-3 md:grid-cols-4">{metrics.map(([label, value]) => <section key={label} className={internalSurfaceSubtle}><p className="text-sm font-semibold text-text-muted">{label}</p><p className="mt-2 text-2xl font-semibold text-foreground">{value}</p></section>)}</div><div className="mt-3 grid gap-3 md:grid-cols-3">{["Empresas e delegações", "Convites, usuários e permissões", "Consumo, cobrança e limites", "Atividades recentes", "Erros de processamento", "Status dos fluxos"].map(item => <section key={item} className={internalSurfaceSubtle}><h2 className="text-sm font-semibold text-foreground">{item}</h2><p className="mt-2 text-sm leading-6 text-text-muted">Sem persistência operacional aplicada.</p></section>)}</div><Link href={buildAdminPath("marcas")} className={`${internalButton} mt-4`}>Abrir cadastro existente <ExternalLink className="ml-1 h-3 w-3"/></Link></main>;
}
