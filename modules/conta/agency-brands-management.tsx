"use client";

import { useState } from "react";
import { Building2, Plus } from "lucide-react";
import { AgencyBrandCard } from "@/components/brand-context-cards";
import { buildTenantPath } from "@/lib/tenant-routing";
import type { AgencyWorkspaceData } from "@/lib/server/agency-workspace";
import { AgencyBrandCreateModal } from "@/modules/conta/agency-brand-create-modal";
import { internalButtonPrimary, internalNoticeSuccess, internalSurface } from "@/components/editorial/internal-page-visual";

const panel = `${internalSurface} p-5 sm:p-6`;

export function AgencyBrandsManagement({ workspace, createdBrandName }: { workspace: AgencyWorkspaceData; createdBrandName?: string }) {
  const [createOpen, setCreateOpen] = useState(false);
  const brands = workspace.brands.map((brand) => ({ ...brand, ownerUserId: null, agencyName: workspace.agency.name }));

  return <section>
     <div className="flex flex-col gap-4 border-b border-divider pb-6 sm:flex-row sm:items-end sm:justify-between">
       <div className="max-w-3xl"><p className="text-sm font-medium text-text-muted">Marcas da Agência</p><h2 className="mt-2 text-2xl font-semibold">Gerencie as Marcas atendidas pela sua Agência</h2><p className="mt-2 text-sm leading-6 text-text-muted">Cadastre, consulte e acesse as Marcas vinculadas a este espaço de trabalho.</p></div>
      {workspace.canManage ? <button type="button" className={`${internalButtonPrimary} min-h-11 px-4`} onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4" aria-hidden="true" />Cadastrar Marca</button> : null}
    </div>

    {createdBrandName ? <p role="status" className={`mt-5 ${internalNoticeSuccess}`}>Marca cadastrada com sucesso: <strong>{createdBrandName}</strong>.</p> : null}
    <AgencyBrandCreateModal agencyRef={workspace.agency.agencyRef} canManage={workspace.canManage} open={createOpen} onClose={() => setCreateOpen(false)} />

    {brands.length ? <div className="mt-6 grid gap-5 md:grid-cols-2">{brands.map((brand) => <AgencyBrandCard key={brand.id} brand={brand} brandHref={brand.authorizedForEditorial ? buildTenantPath({ brandId: brand.id, brandName: brand.name, module: "marca" }) : undefined} showStrategySummary={false} />)}</div> : <div className={`${panel} mt-6`}><div className="flex items-start gap-3"><Building2 className="mt-0.5 h-5 w-5 shrink-0 text-context-accent" aria-hidden="true" /><div><h3 className="font-semibold">Você ainda não cadastrou nenhuma Marca.</h3>{workspace.canManage ? <><p className="mt-2 text-sm leading-6 text-text-muted">Comece cadastrando a primeira Marca atendida pela sua Agência.</p><button type="button" className={`${internalButtonPrimary} mt-4 min-h-11 px-4`} onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4" aria-hidden="true" />Cadastrar primeira Marca</button></> : <p className="mt-2 text-sm leading-6 text-text-muted">O owner ou administrador da Agência precisa cadastrar a primeira Marca.</p>}</div></div></div>}
  </section>;
}
