import Link from "next/link";
import { Building2, CheckCircle2, Users } from "lucide-react";
import type { AgencyWorkspaceData } from "@/lib/server/agency-workspace";
import { AgencyDataForm, AgencyMemberControls } from "@/modules/conta/agency-workspace-controls";
import { AgencyBrandsManagement } from "@/modules/conta/agency-brands-management";
import { internalButton, internalSurface } from "@/components/editorial/internal-page-visual";

const panel = `${internalSurface} p-5 sm:p-6`;

function statusLabel(value: string) {
  return value === "active" ? "Ativa" : value === "suspended" ? "Suspensa" : value === "inactive" ? "Inativa" : value;
}

function accessLabel(workspace: AgencyWorkspaceData) {
  return workspace.access === "owner" ? "Owner" : workspace.role === "agency_admin" ? "Administrador da Agência" : "Membro da Agência";
}

export function AgencyWorkspacePage({ workspace, section = "overview", createdBrandName }: { workspace: AgencyWorkspaceData; section?: "overview" | "membros" | "marcas" | "configuracoes"; createdBrandName?: string }) {
  const base = `/agencias/${workspace.agency.agencyRef}`;
  const title = section === "membros" ? "Membros" : section === "marcas" ? "Marcas" : section === "configuracoes" ? "Configurações" : "Visão geral";

  return <div className="mx-auto max-w-6xl space-y-7 p-5 sm:p-8">
    <header className="flex flex-wrap items-start justify-between gap-5">
      <div><h1 className="text-3xl font-semibold tracking-tight">{section === "overview" ? workspace.agency.name : title}</h1><p className="mt-3 max-w-3xl text-base leading-7 text-text-muted">{section === "overview" ? "Contexto operacional confirmado no servidor. Dados, membros e marcas permanecem vinculados a esta Agência." : `Dados reais de ${workspace.agency.name}.`}</p></div>
      <div className="flex items-center gap-2 rounded-md border border-success/35 px-3 py-2 text-sm font-semibold text-success"><CheckCircle2 className="h-4 w-4" aria-hidden="true" />{statusLabel(workspace.agency.status)}</div>
    </header>

    {section === "overview" ? <>
       <section className={`${panel} grid gap-5 md:grid-cols-2`}><div><h2 className="text-lg font-semibold">Dados da Agência</h2><dl className="mt-4 grid gap-3 text-sm"><div><dt className="text-text-muted">Nome</dt><dd className="mt-1 font-semibold">{workspace.agency.name}</dd></div><div><dt className="text-text-muted">Owner</dt><dd className="mt-1 font-semibold">{workspace.agency.ownerName || workspace.agency.ownerEmail || "Identidade confirmada"}</dd></div><div><dt className="text-text-muted">Acesso</dt><dd className="mt-1 font-semibold">{accessLabel(workspace)}</dd></div></dl><Link href={`${base}/configuracoes`} className="mt-5 inline-flex min-h-11 items-center rounded-md text-sm font-semibold text-context-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-module-accent/30">Abrir dados da Agência</Link></div><div><h2 className="text-lg font-semibold">Próximos contextos</h2><p className="mt-3 text-sm leading-6 text-text-muted">A base operacional está disponível. Notificações, atividade e provider global permanecem fora desta fase.</p><div className="mt-5 flex flex-wrap gap-2"><Link href={`${base}/membros`} className={`${internalButton} min-h-11`}><Users className="h-4 w-4" aria-hidden="true" />Membros</Link><Link href={`${base}/marcas`} className={`${internalButton} min-h-11`}><Building2 className="h-4 w-4" aria-hidden="true" />Marcas</Link></div></div></section>
    </> : null}

     {section === "configuracoes" ? <section className={panel}><h2 className="text-lg font-semibold">Dados da Agência</h2><p className="mt-2 text-sm leading-6 text-text-muted">Apenas campos persistentes da Agência são apresentados. Solicitações, convites e onboarding não são copiados para o cadastro operacional.</p><div className="mt-5 grid gap-5 md:grid-cols-2"><AgencyDataForm agencyRef={workspace.agency.agencyRef} name={workspace.agency.name} canManage={workspace.canManage} /><dl className="grid content-start gap-3 text-sm"><div><dt className="text-text-muted">Status</dt><dd className="mt-1 font-semibold">{statusLabel(workspace.agency.status)}</dd></div><div><dt className="text-text-muted">Referência técnica</dt><dd className="mt-1 break-all font-mono text-xs text-text-muted">Usada internamente pelo servidor; não é entrada manual.</dd></div><div><dt className="text-text-muted">Criada em</dt><dd className="mt-1 font-semibold">{new Date(workspace.agency.createdAt).toLocaleDateString("pt-BR")}</dd></div></dl></div></section> : null}

     {section === "membros" ? <section className={panel}><h2 className="text-xl font-semibold">Membros da Agência</h2><p className="mt-2 text-sm leading-6 text-text-muted">O owner tem acesso máximo à organização. Os demais membros recebem papel e capacidades explícitas; restrições específicas de Marca serão tratadas em fase própria.</p><div className="mt-6"><AgencyMemberControls agencyRef={workspace.agency.agencyRef} members={workspace.members} capabilities={workspace.capabilities} canManage={workspace.canManage} /></div></section> : null}

    {section === "marcas" ? <AgencyBrandsManagement workspace={workspace} createdBrandName={createdBrandName} /> : null}
  </div>;
}
