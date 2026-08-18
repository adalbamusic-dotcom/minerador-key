"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { useSupabaseSession as useSession } from "@/components/auth/supabase-session-context";
import { AlertTriangle, ArrowRight, Building2, Check, CheckCircle2, CircleAlert, Database, Globe, Users } from "lucide-react";
import { useBrand } from "@/components/brand-context";
import { GlobalTopbarPageControls } from "@/components/global-topbar";
import { GLOBAL_TOPBAR_PAGE_TAB, GLOBAL_TOPBAR_PAGE_TAB_ACTIVE, GLOBAL_TOPBAR_PAGE_TABS } from "@/components/global-topbar-control";
import { approvedArticleVersions } from "@/lib/editorial/operational-flow";
import { adaptLegacyBrand } from "@/lib/editorial/adapters";
import { BrandDnaPanel } from "./brand-dna-panel";
import { SiteSitemapPanel } from "./site-sitemap-panel";
import { normalizeSiteUrl } from "@/lib/marca/site-domain";
import { buildTenantPath } from "@/lib/tenant-routing";
import { sessionId, useReadyPipeline } from "@/components/editorial/operational-screen-shared";
import { internalButton, internalButtonPrimary, internalField, internalSection } from "@/components/editorial/internal-page-visual";

const surface = `space-y-4 ${internalSection}`;
const overviewSurface = "space-y-4 border-t border-divider pt-6";
const field = internalField;
const button = internalButton;
const sections = [["visao", "Visão geral"], ["site", "Site e Sitemap"], ["dna", "BrandDNA"], ["materiais", "Materiais"], ["skills", "Skills e prompts"], ["equipe", "Equipe"], ["configuracoes", "Configurações"]] as const;
const roleLabels: Record<string, string> = { admin: "Admin global", cliente: "Cliente", owner: "Owner", brand_admin: "Administrador da marca", editor: "Editor", reviewer: "Revisor", specialist: "Especialista", reader: "Leitor" };
const fieldLabels = { nome: "Nome da marca", nicho: "Nicho", localizacao: "Localização" } as const;
const invitationRoleLabels: Record<string, string> = { strategist: "Estrategista", analyst: "Analista", planner: "Planejador", writer: "Redator", editor: "Editor", reviewer: "Revisor", medical_reviewer: "Revisor técnico", publisher: "Publicador", viewer: "Leitor", external_collaborator: "Colaborador externo" };
const actionLabels: Record<string, string> = { view: "Visualizar", comment: "Comentar", edit: "Editar", write: "Escrever", review: "Revisar", approve: "Aprovar", export: "Exportar", publish: "Publicar" };

function BrandMetric({ label, value }: { label: string; value: number }) {
  return <section className="border-l border-divider pl-4"><p className="text-sm font-semibold text-text-muted">{label}</p><p className="mt-2 text-2xl font-semibold text-foreground">{value}</p></section>;
}

function BrandDetail({ label, value }: { label: string; value: unknown }) {
  return <div><dt className="text-sm font-semibold text-text-muted">{label}</dt><dd className="mt-1 break-words text-base text-foreground">{value === null || value === undefined || value === "" ? "Não informado" : String(value)}</dd></div>;
}

function Message({ message }: { message: string }) {
  return <p role="status" aria-live="polite" className="rounded-md border border-warning/35 bg-warning-soft px-4 py-3 text-sm leading-6 text-warning">{message}</p>;
}

function DataOriginBadge({ origin }: { origin: string }) {
  return <span className="inline-flex items-center gap-1.5 rounded-md border border-divider bg-surface-subtle px-2.5 py-1 text-sm text-text-muted"><Database className="h-3.5 w-3.5" aria-hidden="true" />{origin}</span>;
}

function VersionBadge({ version, hash }: { version: string | number; hash?: string }) {
  return <span title={hash} className="inline-flex items-center rounded-md border border-context-accent/35 bg-context-accent/10 px-2.5 py-1 font-mono text-sm text-context-accent">v{version}</span>;
}

function LocalCollection({ title, count, description }: { title: string; count: number; description: string }) {
  return <section className="rounded-lg border border-divider bg-surface-subtle p-5 sm:p-6"><div className="flex items-start justify-between gap-4"><div><h2 className="text-base font-semibold text-foreground">{title}</h2><p className="mt-2 text-sm leading-6 text-text-muted">{description}</p></div><p className="text-3xl font-semibold leading-none text-foreground" aria-label={`${count} item(ns)`}>{count}</p></div></section>;
}

function EmptyPipelineState({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return <div className="rounded-lg border border-dashed border-divider bg-surface-subtle p-8 text-center"><CircleAlert className="mx-auto h-7 w-7 text-text-muted" aria-hidden="true" /><h2 className="mt-3 text-base font-semibold text-foreground">{title}</h2><p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-text-muted">{description}</p>{action ? <div className="mt-4">{action}</div> : null}</div>;
}

function HumanDecisionRequired({ children }: { children: ReactNode }) {
  return <div className="flex items-start gap-3 rounded-md border border-warning/35 bg-warning-soft px-4 py-3 text-sm leading-6 text-warning"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /><p><strong>Decisão humana obrigatória.</strong> {children}</p></div>;
}

function operationalStatus(value: string | undefined) {
  return value === "active" ? "Ativa" : value === "suspended" ? "Suspensa" : value === "inactive" ? "Inativa" : "Não informado";
}

function OperationalBrandHome({ brand, brandPath, brandDna }: { brand: NonNullable<ReturnType<typeof useBrand>["activeBrand"]>; brandPath: string; brandDna: "loading" | "available" | "absent" | "unavailable" }) {
  const operationalFields = [brand.nome, brand.site_url, brand.nicho, brand.localizacao];
  const completedFields = operationalFields.filter((value) => Boolean(value?.trim())).length;
  return <div className="space-y-6">
    <section className="border-b border-divider pb-6"><p className="text-sm font-medium text-context-accent">Marca atual</p><div className="mt-3 flex flex-wrap items-start justify-between gap-5"><div><h1 className="text-3xl font-semibold tracking-tight text-foreground">{brand.nome}</h1><p className="mt-2 max-w-3xl text-base leading-7 text-text-muted">O cadastro operacional está disponível. Configure a identidade estratégica quando estiver pronto.</p></div><span className="inline-flex items-center gap-2 rounded-md border border-divider px-3 py-2 text-sm font-semibold"><CheckCircle2 className="h-4 w-4 text-success" aria-hidden="true" />{operationalStatus(brand.status)}</span></div></section>
    <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-label="Resumo operacional da marca"><div className="rounded-lg border border-divider bg-surface-subtle p-5"><p className="text-sm text-text-muted">Completude operacional</p><p className="mt-2 text-2xl font-semibold text-foreground">{completedFields}/4</p><p className="mt-2 text-sm leading-6 text-text-muted">Nome, site, nicho e localização.</p></div><div className="rounded-lg border border-divider bg-surface-subtle p-5"><Building2 className="h-5 w-5 text-context-accent" aria-hidden="true" /><p className="mt-3 text-sm text-text-muted">Agência responsável</p><p className="mt-2 font-semibold text-foreground">{brand.agencyName || "Vínculo operacional não informado"}</p></div><div className="rounded-lg border border-divider bg-surface-subtle p-5"><CircleAlert className="h-5 w-5 text-context-accent" aria-hidden="true" /><p className="mt-3 text-sm text-text-muted">BrandDNA</p><p className="mt-2 font-semibold text-foreground">{brandDna === "loading" ? "Verificando…" : brandDna === "available" ? "Disponível" : brandDna === "absent" ? "Ainda não configurado" : "Não foi possível confirmar"}</p></div><div className="rounded-lg border border-divider bg-surface-subtle p-5"><Globe className="h-5 w-5 text-context-accent" aria-hidden="true" /><p className="mt-3 text-sm text-text-muted">Website</p>{brand.site_url ? <a href={brand.site_url} target="_blank" rel="noreferrer" className="mt-2 block truncate font-semibold text-context-accent hover:underline">{brand.site_url}</a> : <p className="mt-2 font-semibold text-text-muted">Não informado</p>}</div></section>
    <section className="rounded-lg border border-divider bg-surface-subtle p-5 sm:p-6"><div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between"><div><h2 className="text-lg font-semibold text-foreground">Próximo passo</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-text-muted">{brandDna === "available" ? "Revise o BrandDNA existente ou continue para o próximo módulo do pipeline." : "O cadastro da Marca está concluído. Configure os dados estratégicos na área canônica de BrandDNA."}</p></div><Link href={`${brandPath}?secao=dna`} className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-md bg-action-accent px-4 text-sm font-semibold text-foreground hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action-accent">{brandDna === "available" ? "Abrir BrandDNA" : "Configurar BrandDNA"}<ArrowRight className="h-4 w-4" aria-hidden="true" /></Link></div></section>
    <dl className="grid gap-4 border-t border-divider pt-6 text-sm sm:grid-cols-3"><div><dt className="text-text-muted">Nicho operacional</dt><dd className="mt-1 font-semibold text-foreground">{brand.nicho || "Não informado"}</dd></div><div><dt className="text-text-muted">Localização / área</dt><dd className="mt-1 font-semibold text-foreground">{brand.localizacao || "Não informado"}</dd></div><div><dt className="text-text-muted">Pipeline</dt><dd className="mt-1 font-semibold text-text-muted">Disponível pelos módulos canônicos após a configuração necessária.</dd></div></dl>
  </div>;
}

export function BrandPage({ initialSection = "visao" }: { initialSection?: string }) {
  const { activeBrand, refreshBrands, userRole, selectedBrandId } = useBrand();
  const { data: session } = useSession();
  const { pipeline, state } = useReadyPipeline();
  const [section, setSection] = useState(initialSection);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [brandDna, setBrandDna] = useState<"loading" | "available" | "absent" | "unavailable">("loading");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [invite, setInvite] = useState({ email: "", role: "writer", expiresInDays: 7, modules: ["redator"], actions: ["view", "edit", "comment"] });
  const [form, setForm] = useState({ nome: activeBrand?.nome || "", site_url: activeBrand?.site_url || "", nicho: activeBrand?.nicho || "", localizacao: activeBrand?.localizacao || "", dna_diretrizes: activeBrand?.dna_diretrizes || "" });
  const pageTabs = <nav aria-label="Seções da marca" className={GLOBAL_TOPBAR_PAGE_TABS} data-global-page-tabs>{sections.map(([id, label]) => <button key={id} type="button" onClick={() => setSection(id)} aria-current={section === id ? "page" : undefined} className={`${GLOBAL_TOPBAR_PAGE_TAB} ${section === id ? GLOBAL_TOPBAR_PAGE_TAB_ACTIVE : ""}`}>{label}</button>)}</nav>;

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (activeBrand) setForm({ nome: activeBrand.nome || "", site_url: activeBrand.site_url || "", nicho: activeBrand.nicho || "", localizacao: activeBrand.localizacao || "", dna_diretrizes: activeBrand.dna_diretrizes || "" });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [activeBrand]);

  useEffect(() => {
    if (!activeBrand) return;
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (!cancelled) setBrandDna("loading");
      return fetch(`/api/marca/brand-dna?brandId=${encodeURIComponent(activeBrand.id)}`, { cache: "no-store" });
    }).then(async (response) => {
      const body = await response.json().catch(() => ({}));
      if (cancelled) return;
      if (!response.ok) { setBrandDna("unavailable"); return; }
      setBrandDna(Array.isArray(body.versions) && body.versions.length ? "available" : "absent");
    }).catch(() => { if (!cancelled) setBrandDna("unavailable"); });
    return () => { cancelled = true; };
  }, [activeBrand]);

  if (!activeBrand) return <><GlobalTopbarPageControls tabs={pageTabs}/>{state}</>;
  const brandPath = buildTenantPath({ brandId: activeBrand.id, brandName: activeBrand.nome, module: "marca" });
  if (section === "visao" && !pipeline.snapshot) return <><GlobalTopbarPageControls tabs={pageTabs}/><main className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6 lg:p-8"><OperationalBrandHome brand={activeBrand} brandPath={brandPath} brandDna={brandDna}/></main></>;
  if (state || !pipeline.snapshot) return <><GlobalTopbarPageControls tabs={pageTabs}/>{state}</>;

  const legacy = adaptLegacyBrand(pipeline.snapshot);
  const save = async (overrides: Partial<typeof form> = {}, rethrow = false) => {
    setSaving(true); setMessage("");
    const nextForm = { ...form, ...overrides };
    try {
      const response = await fetch("/api/marcas", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: activeBrand.id, ...nextForm, silos_existentes: activeBrand.silos_existentes }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Erro ao salvar.");
      await refreshBrands(); setForm(nextForm); setMessage("Marca atualizada.");
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Erro ao salvar.";
      setMessage(detail); if (rethrow) throw new Error(detail);
    } finally { setSaving(false); }
  };

  const sendInvite = async () => {
    setMessage("");
    const expiresAt = new Date(Date.now() + invite.expiresInDays * 86400000).toISOString();
    const input = { email: invite.email, role: invite.role, expiresAt, permissions: invite.modules.map(module => ({ module, actions: invite.actions })), createdBy: sessionId(session) };
    try {
      const response = await fetch("/api/editorial/invitations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ brandId: selectedBrandId, ...input }) });
      const body = await response.json();
      if (!response.ok && body.code === "persistence_unavailable") { pipeline.createInvitation(input as Parameters<typeof pipeline.createInvitation>[0]); setInviteOpen(false); setMessage("Convite mantido apenas localmente; nenhum e-mail foi enviado."); return; }
      if (!response.ok) throw new Error(body.error || "Convite inválido.");
      pipeline.addInvitation(body.invitation); setInviteOpen(false); setMessage(body.message);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Erro ao criar convite."); }
  };

  return <>
    <GlobalTopbarPageControls tabs={pageTabs}/>
    <main className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6 lg:p-8">
      <div><h1 className="text-2xl font-bold tracking-tight text-foreground">{activeBrand.nome}</h1><p className="mt-2 max-w-3xl text-base leading-7 text-text-muted">Organize o contexto da marca e acompanhe sua operação em um único lugar.</p></div>
      {message && <Message message={message}/>}

      {section === "visao" && <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4"><BrandMetric label="Keywords" value={pipeline.snapshot.keywords.length}/><BrandMetric label="ArticleDNAs aprovados" value={approvedArticleVersions(pipeline.articleVersions, pipeline.versionEvents).length}/><BrandMetric label="Itens no Radar" value={pipeline.radarItems.length}/><BrandMetric label="Publicações" value={pipeline.operationalPublications.length + pipeline.snapshot.briefings.length}/><section className={`${overviewSurface} md:col-span-2 xl:col-span-4`}><h2 className="text-lg font-semibold text-foreground">Fluxo operacional</h2><p className="mt-2 text-base leading-7 text-text-muted">Minerador → Arquiteto → Radar → Planejador → Redator → Publicações</p></section></div>}
      {section === "site" && <SiteSitemapPanel brandId={activeBrand.id} siteUrl={activeBrand.site_url || ""} saving={saving} onSave={siteUrl => save({ site_url: normalizeSiteUrl(siteUrl) }, true)}/>}
       {section === "dna" && <div className="space-y-8"><BrandDnaPanel brandId={activeBrand.id} legacyGuidelines={activeBrand.dna_diretrizes || ""} niche={activeBrand.nicho || ""}/><div className="grid gap-8 border-t border-divider pt-8 lg:grid-cols-2"><section className="space-y-4"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-semibold text-foreground">Cadastro da marca</h2><DataOriginBadge origin="real"/></div><dl className="grid gap-4 sm:grid-cols-3"><BrandDetail label="Nicho" value={activeBrand.nicho}/><BrandDetail label="Localização" value={activeBrand.localizacao}/><BrandDetail label="Silos" value={pipeline.snapshot.silos.length}/></dl></section><section className="space-y-4"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-semibold text-foreground">Diretrizes legadas</h2><DataOriginBadge origin="legacy"/></div><VersionBadge version="legacy" hash={legacy.contentHash}/><p className="whitespace-pre-wrap text-sm leading-7 text-text-muted">{legacy.rawGuidelines || "Não informado"}</p><p className="text-sm leading-6 text-warning">Este conteúdo não é BrandDNA estruturado ou aprovado.</p></section></div></div>}
      {section === "materiais" && <LocalCollection title="Materiais da marca" count={pipeline.materials.length} description="Coleção local; persistência própria ainda não está disponível."/>}
      {section === "skills" && <div className="grid gap-4 md:grid-cols-2"><LocalCollection title="Skills" count={pipeline.skills.length} description="Regras reutilizáveis associadas à marca."/><LocalCollection title="Prompts" count={pipeline.prompts.length} description="Prompts permanentes ou específicos de artigo."/></div>}
       {section === "equipe" && <div className="space-y-8"><section className={surface}><div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between"><div><h2 className="text-lg font-semibold text-foreground">Equipe e acessos</h2><p className="mt-2 text-base leading-7 text-text-muted">Convites são temporários e as permissões permanecem granulares por módulo e ação.</p></div><button type="button" className={button} onClick={() => setInviteOpen(value => !value)}><Users className="h-4 w-4" aria-hidden="true"/>{inviteOpen ? "Fechar convite" : "Convidar colaborador"}</button></div>{inviteOpen && <div className="mt-6 grid gap-4 border-t border-divider pt-6 md:grid-cols-2 lg:grid-cols-4"><label className="text-sm font-semibold text-foreground">E-mail<input className={`${field} mt-2`} type="email" aria-label="E-mail do colaborador" placeholder="email@empresa.com" value={invite.email} onChange={event => setInvite(current => ({ ...current, email: event.target.value }))}/></label><label className="text-sm font-semibold text-foreground">Papel<select className={`${field} mt-2`} value={invite.role} onChange={event => setInvite(current => ({ ...current, role: event.target.value }))}>{Object.entries(invitationRoleLabels).map(([role, label]) => <option key={role} value={role}>{label}</option>)}</select></label><label className="text-sm font-semibold text-foreground">Módulo<select className={`${field} mt-2`} value={invite.modules[0]} onChange={event => setInvite(current => ({ ...current, modules: [event.target.value] }))}>{["marca", "minerador", "arquiteto", "radar", "planejador", "redator", "publicacoes"].map(module => <option key={module}>{module}</option>)}</select></label><button type="button" className={`${button} self-end`} onClick={() => void sendInvite()} disabled={!invite.email}>Criar convite pendente</button><fieldset className="md:col-span-2 lg:col-span-4"><legend className="text-sm font-semibold text-foreground">Permissões do convite</legend><div className="mt-3 flex flex-wrap gap-x-5 gap-y-3">{Object.keys(actionLabels).map(action => <label key={action} className="inline-flex items-center gap-2 text-sm text-text-muted"><input type="checkbox" checked={invite.actions.includes(action)} onChange={event => setInvite(current => ({ ...current, actions: event.target.checked ? [...current.actions, action] : current.actions.filter(item => item !== action) }))} className="h-4 w-4 accent-module-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-module-accent/30"/>{actionLabels[action] || action}</label>)}</div></fieldset></div>}</section>{pipeline.invitations.length ? <div className="overflow-x-auto border-t border-divider"><table className="min-w-[900px] w-full text-sm"><thead className="border-b border-divider text-text-muted"><tr><th className="px-4 py-3 text-left font-semibold">E-mail</th><th className="px-4 py-3 text-left font-semibold">Papel</th><th className="px-4 py-3 text-left font-semibold">Escopo</th><th className="px-4 py-3 text-left font-semibold">Validade</th><th className="px-4 py-3 text-left font-semibold">Status</th><th className="px-4 py-3 text-right font-semibold">Ações</th></tr></thead><tbody className="divide-y divide-divider">{pipeline.invitations.map(item => <tr key={item.id} className="text-text-muted"><td className="px-4 py-4 align-top">{item.email}</td><td className="px-4 py-4 align-top">{invitationRoleLabels[item.role] || item.role}</td><td className="max-w-[260px] px-4 py-4 align-top">{item.permissions.map(permission => `${permission.module}: ${permission.actions.map(action => actionLabels[action] || action).join(", ")}`).join(" · ")}</td><td className="px-4 py-4 align-top">{new Date(item.expiresAt).toLocaleDateString("pt-BR")}</td><td className="px-4 py-4 align-top">{item.status} · e-mail não enviado</td><td className="space-x-2 px-4 py-4 text-right align-top"><button type="button" className={button} disabled={item.status !== "pending"} onClick={() => pipeline.updateInvitationStatus(item.id, "cancelled")}>Cancelar</button><button type="button" className={button} onClick={() => pipeline.updateInvitationStatus(item.id, item.status === "suspended" ? "pending" : "suspended")}>{item.status === "suspended" ? "Reativar" : "Suspender"}</button><button type="button" className={button} onClick={() => pipeline.updateInvitationStatus(item.id, "revoked")}>Revogar</button></td></tr>)}</tbody></table></div> : <EmptyPipelineState title="Nenhum convite" description="Ainda não há convites nesta marca. O fluxo atual não envia e-mail e mantém o estado disponível para revisão."/>}<HumanDecisionRequired>Convites foram validados no servidor, mas ainda não possuem persistência própria. O papel de cliente continua sendo um vínculo legado da própria marca.</HumanDecisionRequired></div>}
       {section === "configuracoes" && <section className={`${surface} max-w-4xl`}><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-semibold text-foreground">Configurações da empresa</h2><p className="mt-2 text-base leading-7 text-text-muted">Atualize somente os dados operacionais da marca atual.</p></div><span className="text-sm text-text-muted">Acesso: {roleLabels[userRole] || userRole}</span></div><div className="mt-6 grid gap-5 md:grid-cols-2">{(["nome", "nicho", "localizacao"] as const).map(key => <label key={key} className="text-sm font-semibold text-foreground">{fieldLabels[key]}<input value={form[key]} onChange={event => setForm(current => ({ ...current, [key]: event.target.value }))} className={`${field} mt-2`}/></label>)}<p className="border-y border-divider py-4 text-sm leading-6 text-text-muted md:col-span-2">O endereço do site é gerenciado na aba <strong className="text-foreground">Site e Sitemap</strong>.</p><label className="text-sm font-semibold text-foreground md:col-span-2">Diretrizes legadas<textarea value={form.dna_diretrizes} onChange={event => setForm(current => ({ ...current, dna_diretrizes: event.target.value }))} rows={8} className={`${field} mt-2 min-h-40 h-auto py-3 leading-7`}/></label></div><button type="button" disabled={saving} onClick={() => void save()} className={`${internalButtonPrimary} mt-6 px-4`}><Check className="h-4 w-4" aria-hidden="true"/>{saving ? "Salvando…" : "Salvar configuração"}</button><p className="mt-6 border-t border-divider pt-4 text-sm leading-6 text-text-muted">As pesquisas e métricas Google Ads usam a Connection global e o Research Customer ID da Plataforma. Um Customer ID específico da Marca fica reservado para operações futuras de campanhas, anúncios e gastos.</p></section>}
    </main>
  </>;
}
