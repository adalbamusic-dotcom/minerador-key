"use client";

import Link from "next/link";
import { ExternalLink, Plus } from "lucide-react";
import { useBrand } from "@/components/brand-context";
import { buildAdminPath } from "@/lib/admin-routing";
import { ModuleHeader, Metric, btn, card } from "@/components/editorial/operational-screen-shared";

export function AdminOverviewPage() {
  const { brands } = useBrand(); return <><ModuleHeader title="Admin" description="Controle da plataforma, empresas e acessos delegados." actions={<Link href={buildAdminPath("marcas")} className={btn}><Plus className="mr-1 h-3 w-3"/>Cadastrar nova marca</Link>}/><main className="p-4"><div className="grid gap-3 md:grid-cols-4"><Metric label="Empresas administradas" value={brands.length}/><Metric label="Acessos delegados" value={0}/><Metric label="Alertas" value={0}/><Metric label="Falhas" value={0}/></div><div className="mt-3 grid gap-3 md:grid-cols-3">{["Empresas e delegações", "Convites, usuários e permissões", "Consumo, cobrança e limites", "Atividades recentes", "Erros de processamento", "Status dos fluxos"].map(item => <section key={item} className={card}><h2 className="text-xs font-bold">{item}</h2><p className="mt-2 text-[10px] text-slate-600">Sem persistência operacional aplicada.</p></section>)}</div><Link href={buildAdminPath("marcas")} className={`${btn} mt-4`}>Abrir cadastro existente <ExternalLink className="ml-1 h-3 w-3"/></Link></main></>;
}


