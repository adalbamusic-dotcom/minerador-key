"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useSession } from "next-auth/react";
import { Building2, ChevronLeft, ChevronRight, CircleUser, FilePenLine, Gauge, Key, Library, Network, Radar, Shield, Sparkles } from "lucide-react";
import { PRODUCT_MODULES, menuEntriesForRole, type ProductModule } from "@/lib/editorial/navigation";
import { useBrand } from "./brand-context";

const icons: Record<ProductModule, typeof Building2> = { admin: Shield, marca: Building2, minerador: Key, arquiteto: Network,
  radar: Radar, planejador: Gauge, redator: FilePenLine, publicacoes: Library, conta: CircleUser };

export function ProductShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname(); const { data: session } = useSession();
  const { brands, selectedBrandId, setSelectedBrandId, userRole } = useBrand();
  const [expanded, setExpanded] = useState(false);
  const activeBrand = brands.find(brand => brand.id === selectedBrandId);
  const entries = menuEntriesForRole(userRole).filter(item => item.id !== "conta");
  return <div className="min-h-screen bg-[#06070a] text-slate-200">
    <aside className={`fixed inset-y-0 left-0 z-[70] border-r border-slate-850 bg-[#090a0e]/98 shadow-2xl transition-[width] ${expanded ? "w-56" : "w-11"}`} aria-label="Navegação principal">
      <div className="flex h-10 items-center justify-between border-b border-slate-850 px-2"><Sparkles className="h-4 w-4 shrink-0 text-indigo-400"/>{expanded && <span className="truncate text-[10px] font-black uppercase tracking-wider">Minerador Pro</span>}<button type="button" onClick={() => setExpanded(value => !value)} className="rounded p-1 text-slate-500 hover:text-white" aria-label={expanded ? "Recolher menu" : "Expandir menu"}>{expanded ? <ChevronLeft className="h-3 w-3"/> : <ChevronRight className="h-3 w-3"/>}</button></div>
      {expanded && <div className="border-b border-slate-850 p-2"><p className="text-[8px] font-bold uppercase tracking-wider text-slate-600">Marca ativa</p>{userRole === "admin" ? <select value={selectedBrandId} onChange={event => setSelectedBrandId(event.target.value)} className="mt-1 w-full rounded border border-slate-800 bg-black px-2 py-1 text-[10px]"><option value="" disabled>Selecione</option>{brands.map(brand => <option key={brand.id} value={brand.id}>{brand.nome}</option>)}</select> : <p className="mt-1 truncate text-[10px] font-bold text-slate-300">{activeBrand?.nome || "Sem marca"}</p>}</div>}
      <nav className="py-2">{entries.map(item => { const Icon = icons[item.id]; const active = pathname === item.href || pathname.startsWith(`${item.href}/`); return <Link key={item.id} href={item.href} title={!expanded ? item.label : undefined} className={`flex h-9 items-center gap-2 px-3 text-[10px] font-bold transition-colors ${active ? "bg-indigo-950/50 text-indigo-300" : "text-slate-500 hover:bg-slate-900 hover:text-white"}`}><Icon className="h-4 w-4 shrink-0"/>{expanded && <span>{item.label}</span>}</Link>; })}</nav>
      <div className="absolute inset-x-0 bottom-0 border-t border-slate-850"><Link href={PRODUCT_MODULES.conta.href} className="flex h-10 items-center gap-2 px-3 text-[10px] text-slate-500 hover:text-white"><CircleUser className="h-4 w-4 shrink-0"/>{expanded && <span className="truncate">{session?.user?.email || "Conta"}</span>}</Link></div>
    </aside>
    <div className="min-h-screen pl-11">{children}</div>
  </div>;
}
