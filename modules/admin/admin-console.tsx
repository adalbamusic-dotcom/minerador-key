"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AdminOverviewPage } from "./admin-overview-page";
import { buildAdminPath, isAdminTab, type AdminTab } from "@/lib/admin-routing";
import BrandsAdminPanel from "./brands-admin-panel";

const tabs: Array<{ id: AdminTab; label: string }> = [
  { id: "visao-geral", label: "Visão geral" }, { id: "marcas", label: "Marcas" },
  { id: "usuarios", label: "Usuários e acessos" }, { id: "planos", label: "Planos" },
  { id: "consumo", label: "Consumo" }, { id: "configuracoes", label: "Configurações" },
];

export function AdminConsole() {
  const searchParams = useSearchParams();
  const requested = searchParams.get("tab");
  const tab: AdminTab = isAdminTab(requested) ? requested : "visao-geral";
  return <div className="min-h-screen bg-[#06070a] text-slate-200">
    <nav className="border-b border-slate-850 px-4 py-2" aria-label="Seções administrativas">
      <div className="flex gap-1 overflow-x-auto">{tabs.map(item => <Link key={item.id} href={buildAdminPath(item.id)} className={`whitespace-nowrap rounded px-2 py-1 text-[10px] font-bold ${tab === item.id ? "bg-indigo-950/60 text-indigo-300" : "text-slate-500 hover:text-white"}`}>{item.label}</Link>)}</div>
    </nav>
    {tab === "visao-geral" && <AdminOverviewPage />}
    {tab === "marcas" && <BrandsAdminPanel />}
    {tab !== "visao-geral" && tab !== "marcas" && <section className="p-6"><h1 className="text-sm font-bold">{tabs.find(item => item.id === tab)?.label}</h1><p className="mt-2 max-w-xl text-xs text-slate-500">Esta seção depende de entidades de plano, consumo, usuários e memberships ainda não confirmadas no schema remoto. Nenhum dado foi inventado.</p></section>}
  </div>;
}
