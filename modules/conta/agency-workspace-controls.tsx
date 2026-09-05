"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { AgencyCapability, AgencyWorkspaceMember } from "@/lib/server/agency-workspace";
import { internalButton, internalField, internalNoticeError, internalNoticeSuccess } from "@/components/editorial/internal-page-visual";
import { useNoticeBridge } from "@/components/global-notice-center";

const button = `${internalButton} min-h-11 px-4`;
const input = `${internalField} min-h-11`;

function Result({ message, error = false }: { message: string; error?: boolean }) {
  return <p role={error ? "alert" : "status"} className={error ? internalNoticeError : internalNoticeSuccess}>{message}</p>;
}

export function AgencyDataForm({ agencyRef, name, canManage }: { agencyRef: string; name: string; canManage: boolean }) {
  const router = useRouter();
  const [value, setValue] = useState(name);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  useNoticeBridge({ notice: error || message, module: "conta", area: "Agência", title: "Conta · Agência", fallbackSeverity: error ? "ERROR" : "INFO" });

  async function save() {
    setSaving(true); setMessage(""); setError("");
    const response = await fetch(`/api/agencies/${agencyRef}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: value }) });
    const body = await response.json().catch(() => ({}));
    setSaving(false);
    if (!response.ok) { setError(body.error || "Não foi possível salvar os dados."); return; }
    setMessage("Dados da Agência salvos.");
    if (body.agencyRef && body.agencyRef !== agencyRef) router.replace(`/agencias/${body.agencyRef}/configuracoes`);
    router.refresh();
  }

  return <div className="space-y-4">
    <label className="block text-sm font-semibold" htmlFor="agency-name">Nome da Agência<input id="agency-name" className={`${input} mt-2`} value={value} onChange={(event) => setValue(event.target.value)} disabled={!canManage || saving} /></label>
    {canManage ? <button type="button" className={button} onClick={() => void save()} disabled={saving || !value.trim()}>{saving ? "Salvando…" : "Salvar dados"}</button> : <p className="text-sm leading-6 text-foreground/65">Seu acesso é somente leitura para os dados estruturais da Agência.</p>}
    {message ? <Result message={message} /> : null}{error ? <Result message={error} error /> : null}
  </div>;
}

export function AgencyMemberControls({ agencyRef, members, capabilities, canManage }: { agencyRef: string; members: AgencyWorkspaceMember[]; capabilities: Array<{ code: AgencyCapability; label: string }>; canManage: boolean }) {
  const [query, setQuery] = useState("");
  const [email, setEmail] = useState("");
  const [memberRole, setMemberRole] = useState<"agency_admin" | "agency_member">("agency_member");
  const [selectedCapabilities, setSelectedCapabilities] = useState<AgencyCapability[]>(capabilities.map((item) => item.code));
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [candidates, setCandidates] = useState<Array<{ name: string | null; email: string }>>([]);
  const [saving, setSaving] = useState(false);
  useNoticeBridge({ notice: error || message, module: "conta", area: "Membros da Agência", title: "Conta · Membros", fallbackSeverity: error ? "ERROR" : "INFO" });

     if (!canManage) return <p className="text-sm leading-6 text-text-muted">Você pode consultar os membros, mas apenas o owner ou um administrador da Agência pode gerenciar vínculos e capacidades.</p>;

  async function search() {
    setMessage(""); setError("");
    const response = await fetch(`/api/agencies/${agencyRef}/members?q=${encodeURIComponent(query)}`, { cache: "no-store" });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) { setError(body.error || "Não foi possível pesquisar."); return; }
    setCandidates(body.candidates || []);
  }

  async function save() {
    setSaving(true); setMessage(""); setError("");
    const response = await fetch(`/api/agencies/${agencyRef}/members`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, role: memberRole, status: "active", capabilities: selectedCapabilities }) });
    const body = await response.json().catch(() => ({}));
    setSaving(false);
    if (!response.ok) { setError(body.error || "Não foi possível salvar o membro."); return; }
    setMessage("Membro salvo. Nenhum e-mail foi enviado nesta fase."); setEmail(""); setCandidates([]);
  }

  async function toggleStatus(member: AgencyWorkspaceMember) {
    if (!member.id) return;
    const next = member.status === "active" ? "suspended" : "active";
    const response = await fetch(`/api/agencies/${agencyRef}/members`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ membershipId: member.id, status: next }) });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) setError(body.error || "Não foi possível alterar o status."); else setMessage("Status do membro atualizado.");
  }

     return <div className="space-y-6">
     <div className="grid gap-3 rounded-lg border border-divider bg-surface-subtle p-4 md:grid-cols-[1fr_auto]">
      <div><label htmlFor="member-search" className="text-sm font-semibold">Adicionar identidade Auth existente</label><input id="member-search" className={`${input} mt-2`} placeholder="Nome ou e-mail" value={query} onChange={(event) => setQuery(event.target.value)} /></div>
      <button type="button" className={`${button} self-end`} onClick={() => void search()} disabled={query.trim().length < 3}>Pesquisar</button>
       <div className="md:col-span-2">{candidates.map((candidate) => <button type="button" key={candidate.email} onClick={() => setEmail(candidate.email)} className={`${internalButton} mr-2 mt-1 min-h-10 px-3 text-left`}><span className="font-semibold">{candidate.name || candidate.email}</span>{candidate.name ? <span className="ml-2 text-text-muted">{candidate.email}</span> : null}</button>)}</div>
      <div className="md:col-span-2 grid gap-3 sm:grid-cols-2"><label className="text-sm font-semibold">E-mail selecionado<input className={`${input} mt-2`} value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Selecione um resultado" /></label><label className="text-sm font-semibold">Papel<select className={`${input} mt-2`} value={memberRole} onChange={(event) => setMemberRole(event.target.value as typeof memberRole)}><option value="agency_member">Membro da Agência</option><option value="agency_admin">Administrador da Agência</option></select></label></div>
       <fieldset className="md:col-span-2"><legend className="text-sm font-semibold">Capacidades explícitas</legend><div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{capabilities.map((capability) => <label key={capability.code} className="flex min-h-10 items-center gap-2 text-sm"><input className="h-4 w-4 accent-module-accent" type="checkbox" checked={selectedCapabilities.includes(capability.code)} onChange={(event) => setSelectedCapabilities((current) => event.target.checked ? [...new Set([...current, capability.code])] : current.filter((item) => item !== capability.code))} />{capability.label}</label>)}</div></fieldset>
      <button type="button" className={`${button} md:col-span-2 md:justify-self-start`} onClick={() => void save()} disabled={saving || !email}>{saving ? "Salvando…" : "Salvar membro"}</button>
    </div>
    {message ? <Result message={message} /> : null}{error ? <Result message={error} error /> : null}
     <div className="overflow-x-auto"><table className="w-full min-w-[44rem] border-separate border-spacing-0 text-left text-sm"><thead><tr className="text-text-muted"><th className="border-b border-divider px-3 py-3 font-medium">Pessoa</th><th className="border-b border-divider px-3 py-3 font-medium">Papel</th><th className="border-b border-divider px-3 py-3 font-medium">Status</th><th className="border-b border-divider px-3 py-3 font-medium">Capacidades</th><th className="border-b border-divider px-3 py-3 font-medium">Ação</th></tr></thead><tbody>{members.map((member) => <tr key={member.id || "owner"}><td className="border-b border-divider px-3 py-4"><span className="font-semibold">{member.name || "Identidade sem nome"}</span><span className="block text-text-muted">{member.email || "E-mail não disponível"}</span></td><td className="border-b border-divider px-3 py-4">{member.role === "owner" ? "Owner" : member.role === "agency_admin" ? "Administrador" : "Membro"}</td><td className="border-b border-divider px-3 py-4">{member.status === "active" ? "Ativo" : member.status === "suspended" ? "Suspenso" : "Removido"}</td><td className="border-b border-divider px-3 py-4">{member.isOwner ? "Acesso máximo da Agência" : `${member.capabilities.length} de ${capabilities.length}`}</td><td className="border-b border-divider px-3 py-4">{member.isOwner ? <span className="text-text-muted">Protegido</span> : <button type="button" className={`${internalButton} min-h-10 px-3`} onClick={() => void toggleStatus(member)}>{member.status === "active" ? "Suspender" : "Ativar"}</button>}</td></tr>)}</tbody></table></div>
  </div>;
}
