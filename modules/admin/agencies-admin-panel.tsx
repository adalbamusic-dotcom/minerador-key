"use client";

import { useEffect, useState } from "react";
import { Loader2, MailPlus, X } from "lucide-react";
import { GlobalTopbarPageControls } from "@/components/global-topbar";
import { GLOBAL_TOPBAR_ACTION_CONTROL } from "@/components/global-topbar-control";
import { internalButton as btn, internalField, internalSurface as card } from "@/components/editorial/internal-page-visual";
import { useNoticeBridge } from "@/components/global-notice-center";

type AccessPeriod = { planCode: string; origin: string; startsAt: string; endsAt: string | null; status: string };
type Agency = { id: string; name: string; agencyRef: string; status: string; accessStatus?: "READY" | "PENDING" | "REQUIRES_ATTENTION"; ownerIdentityStatus?: "IDENTITY_FOUND" | "CONFIRMATION_PENDING" | "IDENTITY_NOT_FOUND"; accessPeriod?: AccessPeriod | null };
type Application = { id: string; proposed_agency_name: string; plan_code: string; status: string; hasActiveInvitation?: boolean };
type Invitation = { id: string; proposed_agency_name: string; plan_code: string; source: string; status: string; expires_at: string; access_expires_at?: string | null; is_operational?: boolean; isOperational?: boolean };
type AgencyView = "pending" | "invitations" | "active" | "history";

const field = `${internalField} mt-1 text-base`;
const actionButton = btn;

function formatDate(value: string | null | undefined, label: string) {
  const date = new Date(value || "");
  return Number.isNaN(date.getTime()) ? `${label}: não informada` : `${label}: ${date.toLocaleDateString("pt-BR")}`;
}

function communicationNotice(status: string | undefined) {
  if (status === "SENT") return "Mensagem persistida e aceita pelo provider. Entrega final depende do evento do provider.";
  if (status === "FAILED") return "Mensagem persistida, mas a tentativa de envio falhou. O retry permanece limitado e auditável.";
  if (status === "QUEUED" || status === "NOT_CONFIGURED") return "Mensagem persistida na fila durável. O envio ainda não foi confirmado.";
  return "Operação concluída sem confirmação de entrega.";
}

function isFutureDate(value: string | null | undefined) {
  const timestamp = Date.parse(value || "");
  return Number.isFinite(timestamp) && timestamp > Date.now();
}

function isActionableInvitation(invitation: Invitation) {
  if (invitation.status !== "PENDING" || !isFutureDate(invitation.expires_at)) return false;
  if (invitation.is_operational === false || invitation.isOperational === false) return false;
  return invitation.source !== "ADMIN_INVITE" || isFutureDate(invitation.access_expires_at);
}

function invitationValidity(invitation: Invitation) {
  const validity = [formatDate(invitation.expires_at, "Link até")];
  if (invitation.source === "ADMIN_INVITE") validity.push(formatDate(invitation.access_expires_at, "Acesso até"));
  return validity.join(" · ");
}

function historicalInvitationLabel(invitation: Invitation) {
  return invitation.source === "PUBLIC_APPLICATION" ? `Ativação · ${invitation.status}` : `Convite administrativo · ${invitation.status}`;
}

function planLabel(planCode: string | null | undefined) {
  return planCode === "FREE" ? "Plano Free" : planCode ? `Plano ${planCode}` : "Plano: não informado";
}

function accessPeriodSummary(period: AccessPeriod | null | undefined) {
  if (!period) return ["Período de acesso: não disponível"];
  const summary = [planLabel(period.planCode)];
  if (period.origin === "PUBLIC_FREE_TRIAL") summary.push("Teste de 30 dias");
  else if (period.origin === "ADMIN_TRUSTED_INVITE") summary.push("Acesso de teste");
  else summary.push("Acesso interno");
  summary.push(period.endsAt ? formatDate(period.endsAt, "Válido até") : "Válido até: sem prazo");
  return summary;
}

export default function AgenciesAdminPanel() {
  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [view, setView] = useState<AgencyView>("pending");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  useNoticeBridge({ notice, module: "admin", area: "Agências", title: "Administração · Agências", fallbackSeverity: "INFO" });
  const [form, setForm] = useState({ agencyName: "", responsibleName: "", destinationEmail: "", accessExpiresAt: "" });

  const load = async () => {
    setLoading(true);
    try {
      const responses = await Promise.all(["/api/admin/agencies", "/api/admin/agency-applications", "/api/admin/agency-invitations"].map((url) => fetch(url, { cache: "no-store" })));
      const bodies = await Promise.all(responses.map((response) => response.json().catch(() => ({}))));
      if (responses.some((response) => !response.ok)) throw new Error(bodies.find((body) => body.error)?.error || "Não foi possível carregar as agências.");
      setAgencies(bodies[0].agencies || []); setApplications(bodies[1].applications || []); setInvitations(bodies[2].invitations || []);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível carregar as agências."); } finally { setLoading(false); }
  };

  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, []);

  const invite = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setError(""); setNotice(""); setSaving(true);
    try {
      const response = await fetch("/api/admin/agency-invitations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, accessExpiresAt: form.accessExpiresAt ? new Date(`${form.accessExpiresAt}T23:59:59`).toISOString() : undefined }) });
      const body = await response.json().catch(() => ({})); if (!response.ok) throw new Error(body.error || "Não foi possível criar o convite.");
      setNotice(communicationNotice(body.deliveryStatus)); setOpen(false); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível criar o convite."); } finally { setSaving(false); }
  };

  const review = async (applicationId: string, action: "approve" | "reject" | "reinvite") => {
    setError(""); setSaving(true);
    try {
      const response = await fetch("/api/admin/agency-applications", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ applicationId, action }) });
      const body = await response.json().catch(() => ({})); if (!response.ok) throw new Error(body.error || "Não foi possível revisar a solicitação.");
      if (action !== "reject") setNotice(communicationNotice(body.deliveryStatus));
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível revisar a solicitação."); } finally { setSaving(false); }
  };

  const invitationAction = async (invitationId: string, action: "rotate" | "revoke") => {
    setError(""); setSaving(true);
    try {
      const response = await fetch("/api/admin/agency-invitations", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(action === "rotate" ? { action, invitationId } : { invitationId }) });
      const body = await response.json().catch(() => ({})); if (!response.ok) throw new Error(body.error || "Não foi possível atualizar o convite.");
      if (action === "rotate") setNotice(communicationNotice(body.deliveryStatus));
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível atualizar o convite."); } finally { setSaving(false); }
  };

  const pendingApplications = applications.filter((item) => item.status === "PENDING");
  const activeAgencies = agencies.filter((item) => item.status === "active");
  const operationalInvitations = invitations.filter(isActionableInvitation);
  const historicalApplications = applications.filter((item) => item.status === "APPROVED" || item.status === "REJECTED");
  const historicalInvitations = invitations.filter((item) => ["ACCEPTED", "REVOKED", "EXPIRED"].includes(item.status));
  const pageAction = <button type="button" className={GLOBAL_TOPBAR_ACTION_CONTROL} onClick={() => { setOpen(true); setError(""); }}><MailPlus className="h-3.5 w-3.5" aria-hidden="true" />Convidar agência</button>;

  return <><GlobalTopbarPageControls actions={pageAction}/><main className="min-w-0 p-4 sm:p-6">
    <p className="max-w-3xl text-sm leading-6 text-foreground/70">Solicitações, convites autorizados e agências existentes.</p>
    {error ? <p role="alert" className="mt-4 rounded-md border border-danger/35 bg-danger-soft p-3 text-sm text-danger">{error}</p> : null}
    {notice ? <p role="status" className="mt-4 rounded-md border border-foreground/15 bg-foreground/5 p-3 text-sm">{notice}</p> : null}
    <p className="mt-3 text-sm text-foreground/65">Convites são persistidos e processados pela fila de comunicação. Nenhum link ou credencial é exposto ao administrador.</p>
    <nav aria-label="Visões de agências" className="mt-5 flex flex-wrap gap-2 border-b border-foreground/10 pb-3">{([["pending", "Pendentes"], ["invitations", "Convites"], ["active", "Ativas"], ["history", "Histórico"]] as const).map(([key, label]) => <button key={key} type="button" onClick={() => setView(key)} className={`min-h-10 rounded-md px-3 text-sm font-semibold ${view === key ? "bg-accent text-foreground" : "border border-foreground/20 text-foreground/75 hover:bg-foreground/10"}`}>{label}</button>)}</nav>
    {view === "pending" ? <section className={`${card} mt-5`}><h2 className="text-lg font-semibold">Solicitações pendentes</h2>{loading ? <p className="mt-4 flex items-center gap-2 text-sm"><Loader2 className="h-4 w-4 animate-spin" />Carregando...</p> : pendingApplications.length ? <div className="mt-4 divide-y divide-foreground/10">{pendingApplications.map((item) => <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm"><div><p className="font-medium">{item.proposed_agency_name}</p><p className="text-foreground/65">Plano {item.plan_code} · {item.status}</p></div><div className="flex gap-2"><button type="button" disabled={saving} className={actionButton} onClick={() => void review(item.id, "reject")}>Rejeitar</button><button type="button" disabled={saving} className={btn} onClick={() => void review(item.id, "approve")}>Aprovar e convidar</button></div></div>)}</div> : <p className="mt-3 text-sm text-foreground/65">Nenhuma solicitação pendente.</p>}</section> : null}
    {view === "invitations" ? <section className={`${card} mt-5`}><h2 className="text-lg font-semibold">Convites que exigem ação</h2>{operationalInvitations.length ? <div className="mt-4 divide-y divide-foreground/10">{operationalInvitations.map((item) => <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm"><div><p className="font-medium">{item.proposed_agency_name}</p><p className="text-foreground/65">Plano {item.plan_code} · {item.source} · Status: {item.status} · {invitationValidity(item)}</p></div><div className="flex flex-wrap gap-2"><button type="button" disabled={saving} className={actionButton} onClick={() => void invitationAction(item.id, "rotate")}>Reenviar convite</button><button type="button" disabled={saving} className={actionButton} onClick={() => void invitationAction(item.id, "revoke")}>Revogar</button></div></div>)}</div> : <p className="mt-3 text-sm text-foreground/65">Nenhum convite pendente.</p>}</section> : null}
    {view === "active" ? <section className={`${card} mt-5`}><h2 className="text-lg font-semibold">Agências ativas</h2>{loading ? <p className="mt-4 flex items-center gap-2 text-sm"><Loader2 className="h-4 w-4 animate-spin" />Carregando...</p> : activeAgencies.length ? <div className="mt-4 divide-y divide-foreground/10">{activeAgencies.map((agency) => <div key={agency.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm"><div><p className="font-medium">{agency.name}</p><p className="text-foreground/65">Agência: ACTIVE · Acesso: {agency.accessStatus || "REQUIRES_ATTENTION"}</p><p className="mt-2 font-medium">Plano e acesso</p>{accessPeriodSummary(agency.accessPeriod).map((line) => <p key={line} className="text-foreground/65">{line}</p>)}<p className="mt-1 text-foreground/65">{agency.ownerIdentityStatus === "IDENTITY_FOUND" ? "Identidade encontrada e e-mail confirmado." : agency.ownerIdentityStatus === "CONFIRMATION_PENDING" ? "Confirmação de e-mail pendente." : "Identidade do owner requer atenção."}</p></div></div>)}</div> : <p className="mt-3 text-sm text-foreground/65">Nenhuma agência ativa.</p>}</section> : null}
    {view === "history" ? <section className={`${card} mt-5`}><h2 className="text-lg font-semibold">Histórico</h2>{historicalApplications.length || historicalInvitations.length ? <div className="mt-4 divide-y divide-foreground/10">{historicalApplications.map((item) => <div key={`application-${item.id}`} className="py-3 text-sm"><p className="font-medium">{item.proposed_agency_name}</p><p className="text-foreground/65">Solicitação pública · {item.status} · {planLabel(item.plan_code)}</p></div>)}{historicalInvitations.map((item) => <div key={`invitation-${item.id}`} className="py-3 text-sm"><p className="font-medium">{item.proposed_agency_name}</p><p className="text-foreground/65">{historicalInvitationLabel(item)} · {invitationValidity(item)}</p></div>)}</div> : <p className="mt-3 text-sm text-foreground/65">Nenhum registro histórico.</p>}</section> : null}
    {open ? <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 grid place-items-center bg-background/85 p-4"><section className={`${card} w-full max-w-lg p-5`}><div className="flex justify-between gap-4"><div><h2 className="text-lg font-semibold">Convidar agência</h2><p className="mt-1 text-sm text-foreground/65">O convite não cria a agência até o aceite autenticado.</p></div><button type="button" aria-label="Fechar" onClick={() => setOpen(false)}><X className="h-5 w-5" /></button></div><form className="mt-5 space-y-4" onSubmit={invite}><label className="block text-sm">Agência ou empresa<input className={field} value={form.agencyName} onChange={(event) => setForm({ ...form, agencyName: event.target.value })} required /></label><label className="block text-sm">Responsável<input className={field} value={form.responsibleName} onChange={(event) => setForm({ ...form, responsibleName: event.target.value })} required /></label><label className="block text-sm">E-mail<input className={field} type="email" value={form.destinationEmail} onChange={(event) => setForm({ ...form, destinationEmail: event.target.value })} required /></label><label className="block text-sm">Plano<input className={field} value="Free" disabled /></label><label className="block text-sm">Validade do acesso<input className={field} type="date" value={form.accessExpiresAt} onChange={(event) => setForm({ ...form, accessExpiresAt: event.target.value })} required /></label><p className="text-sm text-foreground/65">A validade técnica do link continua curta e separada do período de acesso.</p><button type="submit" disabled={saving} className={btn}>{saving ? "Criando convite..." : "Criar convite"}</button></form></section></div> : null}
  </main></>;
}
