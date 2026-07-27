"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { signOut, useSession } from "next-auth/react";
import { Building2, ChevronLeft, ChevronRight, CircleUser, FilePenLine, Gauge, Key, Library, LogOut, Network, Radar, Shield, Sparkles } from "lucide-react";
import { PRODUCT_FLOW, menuEntriesForRole, type ProductModule } from "@/lib/editorial/navigation";
import { useBrand } from "./brand-context";
import type { TenantContext } from "@/lib/server/tenant-context";
import { buildTenantPath, switchTenantPath, type TenantRouteModule } from "@/lib/tenant-routing";
import { buildAdminPath } from "@/lib/admin-routing";

const icons: Record<ProductModule, typeof Building2> = { admin: Shield, marca: Building2, minerador: Key, arquiteto: Network,
  radar: Radar, planejador: Gauge, redator: FilePenLine, publicacoes: Library, conta: CircleUser };

export function ProductShell({ children, tenant }: { children: React.ReactNode; tenant?: TenantContext }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { data: session } = useSession();
  const { brands, selectedBrandId, setSelectedBrandId, userRole } = useBrand();
  const [expanded, setExpanded] = useState(false);
  const activeBrand = brands.find(brand => brand.id === selectedBrandId);
  const activeTenantName = tenant?.brandName || activeBrand?.nome || "Sem marca";
  const isGlobalAdmin = tenant?.isGlobalAdmin || userRole === "admin";
  const isAdminSurface = pathname.startsWith("/admin");
  const entries = menuEntriesForRole(isGlobalAdmin ? "admin" : userRole)
    .filter(item => PRODUCT_FLOW.includes(item.id as Exclude<ProductModule, "conta" | "admin">))
    .filter(item => !tenant || item.id === "marca" || tenant.permissions.includes(`${item.id}:view`));
  const selectedBrand = brands.find(brand => brand.id === selectedBrandId);
  const moduleHref = (module: TenantRouteModule) => {
    const brand = tenant ? { brandId: tenant.brandId, brandName: tenant.brandName } : selectedBrand ? { brandId: selectedBrand.id, brandName: selectedBrand.nome } : null;
    return brand ? buildTenantPath({ ...brand, module }) : `/selecionar-marca?destino=${encodeURIComponent(module)}`;
  };
  const navigationEntries = entries.map(item => ({ ...item, href: moduleHref(item.id as TenantRouteModule) }));
  const switchBrand = (brandId: string) => {
    setSelectedBrandId(brandId);
    if (isAdminSurface) return;
    const allowedModules: TenantRouteModule[] | undefined = tenant?.isGlobalAdmin ? undefined : ["marca"];
    const targetBrand = brands.find(brand => brand.id === brandId);
    if (!targetBrand) return;
    router.push(switchTenantPath({ targetBrand: { brandId, brandName: targetBrand.nome }, pathname, search: searchParams.toString(), allowedModules }));
  };

  return <div className="min-h-screen bg-[#06070a] text-slate-200">
    <aside className={`fixed inset-y-0 left-0 z-[70] border-r border-slate-850 bg-[#090a0e]/98 shadow-2xl transition-[width] ${expanded ? "w-56" : "w-11"}`} aria-label="Navegação principal">
      <div className="flex h-10 items-center justify-between border-b border-slate-850 px-2"><Sparkles className="h-4 w-4 shrink-0 text-indigo-400"/>{expanded && <span className="truncate text-[10px] font-black uppercase tracking-wider">Minerador Pro</span>}<button type="button" onClick={() => setExpanded(value => !value)} className="rounded p-1 text-slate-500 hover:text-white" aria-label={expanded ? "Recolher menu" : "Expandir menu"}>{expanded ? <ChevronLeft className="h-3 w-3"/> : <ChevronRight className="h-3 w-3"/>}</button></div>
      {expanded && <div className="border-b border-slate-850 p-2"><p className="text-[8px] font-bold uppercase tracking-wider text-slate-600">Marca ativa</p>{isGlobalAdmin ? <><select value={tenant?.brandId || selectedBrandId || ""} onChange={event => switchBrand(event.target.value)} className="mt-1 w-full rounded border border-slate-800 bg-black px-2 py-1 text-[10px]"><option value="" disabled>Selecione</option>{brands.map(brand => <option key={brand.id} value={brand.id}>{brand.nome}</option>)}</select><p className="mt-1 text-[8px] font-bold text-amber-300">Administrando como Admin global</p></> : <><p className="mt-1 truncate text-[10px] font-bold text-slate-300">{activeTenantName}</p>{tenant && <p className="mt-0.5 font-mono text-[8px] text-slate-500" title={tenant.brandId}>{tenant.brandId.slice(0, 8)}…</p>}</>}</div>}
      <nav className="py-2">{navigationEntries.map((item, index) => { const Icon = icons[item.id]; const href = item.href; const active = pathname === href || pathname.startsWith(`${href}/`); return <Link key={`${item.id}-${index}`} href={href} title={!expanded ? item.label : undefined} className={`flex h-9 items-center gap-2 px-3 text-[10px] font-bold transition-colors ${active ? "bg-indigo-950/50 text-indigo-300" : "text-slate-500 hover:bg-slate-900 hover:text-white"}`}><Icon className="h-4 w-4 shrink-0"/>{expanded && <span>{item.label}</span>}</Link>; })}</nav>
      <div className="absolute inset-x-0 bottom-0 border-t border-slate-850"><Link href={moduleHref("conta")} className="flex h-10 items-center gap-2 px-3 text-[10px] text-slate-500 hover:text-white"><CircleUser className="h-4 w-4 shrink-0"/>{expanded && <span className="truncate">{session?.user?.email || "Minha conta"}</span>}</Link>{isGlobalAdmin && <Link href={buildAdminPath()} className={`flex h-9 items-center gap-2 px-3 text-[10px] ${isAdminSurface ? "bg-indigo-950/50 text-indigo-300" : "text-slate-500 hover:text-white"}`}><Shield className="h-4 w-4 shrink-0"/>{expanded && <span>Painel Admin</span>}</Link>}<button type="button" onClick={() => signOut({ callbackUrl: "/" })} className="flex h-9 w-full items-center gap-2 px-3 text-[10px] text-rose-400 hover:bg-rose-950/15"><LogOut className="h-4 w-4 shrink-0"/>{expanded && <span>Sair</span>}</button></div>
    </aside>
    <div className="min-h-screen pl-11">{children}</div>
  </div>;
}
