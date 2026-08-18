"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { GLOBAL_TOPBAR_CONTROL_TYPOGRAPHY } from "@/components/global-topbar-control";

export function MineradorSectionTabs({ brandRef }: { brandRef: string }) {
  const pathname = usePathname();
  const discoverHref = `/${brandRef}/minerador/descobrir`;
  const processHref = `/${brandRef}/minerador`;
  const active = pathname === discoverHref ? "discover" : "process";
  const controls = [
    { id: "discover", href: discoverHref, label: "Descobrir Keywords" },
    { id: "process", href: processHref, label: "Processar Keywords" },
  ] as const;

  return <nav data-minerador-section-tabs className="grid h-8 w-40 shrink-0 grid-cols-2 items-center gap-0.5 rounded-md border border-divider-dark bg-surface-subtle p-0.5 lg:w-72" aria-label="Áreas do Minerador">
    {controls.map(control => <Link key={control.id} href={control.href} aria-current={active === control.id ? "page" : undefined} className={`inline-flex h-7 w-full items-center justify-center rounded-md border px-3 ${GLOBAL_TOPBAR_CONTROL_TYPOGRAPHY} whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-module-accent/50 ${active === control.id ? "border-module-accent/45 bg-module-accent/15 text-module-accent" : "border-divider-dark bg-transparent text-foreground/65 hover:border-module-accent/30 hover:bg-module-accent/10 hover:text-foreground hover:ring-1 hover:ring-module-accent/10"}`}><span className="lg:hidden">{control.id === "discover" ? "Descobrir" : "Processar"}</span><span className="hidden lg:inline">{control.label}</span></Link>)}
  </nav>;
}
