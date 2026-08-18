"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { GlobalTopbarPageControls } from "@/components/global-topbar";
import { GLOBAL_TOPBAR_PAGE_TAB, GLOBAL_TOPBAR_PAGE_TAB_ACTIVE, GLOBAL_TOPBAR_PAGE_TABS } from "@/components/global-topbar-control";
import { ProductShell } from "@/components/product-shell";

export type WorkspaceBrandLink = { id: string; nome: string };
export type WorkspaceAgencyLink = { id: string; name: string; agencyRef: string };

type WorkspaceFrameProps = {
  children: React.ReactNode;
  agencyRef?: string;
  agencyName?: string;
  isGlobalAdmin?: boolean;
  brands?: WorkspaceBrandLink[];
  agencies?: WorkspaceAgencyLink[];
};

const agencySections = [
  { suffix: "", label: "Visão geral" },
  { suffix: "/membros", label: "Membros" },
  { suffix: "/marcas", label: "Marcas" },
  { suffix: "/integracoes", label: "Integrações" },
  { suffix: "/configuracoes", label: "Configurações" },
];

function AgencyPageControls({ agencyRef }: { agencyRef: string }) {
  const pathname = usePathname();
  const base = `/agencias/${agencyRef}`;
  const tabs = <nav className={GLOBAL_TOPBAR_PAGE_TABS} aria-label="Navegação da Agência · Minha Agência" data-global-page-tabs>
        {agencySections.map(({ suffix, label }) => {
          const href = `${base}${suffix}`;
          const active = suffix ? pathname === href : pathname === base || pathname === `${base}/`;
          return <Link key={suffix || "overview"} href={href} aria-current={active ? "page" : undefined} className={`${GLOBAL_TOPBAR_PAGE_TAB} ${active ? GLOBAL_TOPBAR_PAGE_TAB_ACTIVE : ""}`}>{label}</Link>;
        })}
      </nav>;
  return <GlobalTopbarPageControls tabs={tabs}/>;
}

export function WorkspaceFrame({ children, agencyRef }: WorkspaceFrameProps) {
  return <ProductShell>
    {agencyRef ? <AgencyPageControls agencyRef={agencyRef} /> : null}
    {children}
  </ProductShell>;
}
