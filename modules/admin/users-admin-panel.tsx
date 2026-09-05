"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { AdminMembershipSummary, AdminUserRecord } from "@/lib/admin-users-contract";
import { internalButton, internalButtonDanger, internalButtonPrimary, internalField, internalNoticeError, internalNoticeSuccess, internalSelected, internalSurface, internalSurfaceSubtle } from "@/components/editorial/internal-page-visual";
import { useNoticeBridge } from "@/components/global-notice-center";

type Notice = { tone: "success" | "error"; message: string } | null;

const identityLabels = {
  confirmed: "E-mail confirmado",
  pending_confirmation: "Aguardando confirmação",
  disabled: "Identidade bloqueada",
} as const;

const accessLabels = {
  global_admin: "Administrador global",
  brand_member: "Membro de marca",
  agency_member: "Membro de agência",
  no_association: "Sem associação operacional",
} as const;

function MembershipList({ title, items, empty }: { title: string; items: AdminMembershipSummary[]; empty: string }) {
  return <section className={internalSurfaceSubtle}>
    <h3 className="text-sm font-semibold text-foreground">{title}</h3>
    {items.length ? <ul className="mt-3 space-y-2">{items.map(item => <li key={`${item.id}-${item.role}`} className="flex flex-wrap items-center justify-between gap-2 border-t border-divider pt-2 text-sm first:border-t-0 first:pt-0"><span className="text-foreground">{item.label}</span><span className="text-xs text-text-muted">{item.role} · {item.status}</span></li>)}</ul> : <p className="mt-2 text-sm text-text-muted">{empty}</p>}
  </section>;
}

export default function UsersAdminPanel() {
  const [query, setQuery] = useState("");
  const [users, setUsers] = useState<AdminUserRecord[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [confirmGrant, setConfirmGrant] = useState(false);
  const [confirmRemoval, setConfirmRemoval] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  useNoticeBridge({ notice, module: "admin", area: "Usuários", title: "Administração · Usuários", fallbackSeverity: "INFO" });

  const load = useCallback(async (nextQuery: string) => {
    setLoading(true);
    try {
      const params = nextQuery.trim().length >= 2 ? `?q=${encodeURIComponent(nextQuery.trim())}` : "";
      const response = await fetch(`/api/admin/users${params}`, { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : "Não foi possível carregar os usuários.");
      const records = Array.isArray(payload.users) ? payload.users as AdminUserRecord[] : [];
      setUsers(records);
      setSelectedId(current => records.some(user => user.identity.id === current) ? current : records[0]?.identity.id || null);
    } catch (error) {
      setUsers([]);
      setSelectedId(null);
      setNotice({ tone: "error", message: error instanceof Error ? error.message : "Não foi possível carregar os usuários." });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const initialLoad = window.setTimeout(() => { void load(""); }, 0);
    return () => window.clearTimeout(initialLoad);
  }, [load]);

  const selected = useMemo(() => users.find(user => user.identity.id === selectedId) || null, [selectedId, users]);

  async function submitSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice(null);
    await load(query);
  }

  async function updateRole(action: "grant" | "remove") {
    if (!selected || saving) return;
    setSaving(true);
    setNotice(null);
    try {
      const response = await fetch("/api/admin/users", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId: selected.identity.id, action }) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : "Não foi possível confirmar a alteração de papel.");
      await load(query);
      setNotice({ tone: "success", message: typeof payload.message === "string" ? payload.message : "Papel global atualizado." });
      setConfirmGrant(false);
      setConfirmRemoval(false);
    } catch (error) {
      setNotice({ tone: "error", message: error instanceof Error ? error.message : "Não foi possível alterar o papel global." });
    } finally {
      setSaving(false);
    }
  }

  const roleBadge = (isAdmin: boolean) => `inline-flex items-center rounded-md border px-3 py-1 text-sm font-semibold ${isAdmin ? "border-success/35 bg-success-soft text-success" : "border-divider bg-surface-subtle text-text-muted"}`;
  return <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
    <header className="border-b border-divider pb-5"><p className="max-w-3xl text-sm leading-6 text-text-muted">Consulte identidades do Supabase Auth e gerencie somente o papel global. Propriedade de marcas e memberships são exibidos para contexto e não são alterados aqui.</p></header>
    <form onSubmit={submitSearch} className={`${internalSurface} mt-5 flex flex-col gap-3 sm:flex-row sm:items-end`} aria-label="Buscar usuários Auth"><label className="grid flex-1 gap-1.5 text-sm font-medium text-foreground">Buscar usuário por e-mail ou nome<input value={query} onChange={event => setQuery(event.target.value)} placeholder="Ex.: scalbeto@gmail.com" className={`${internalField} mt-1`} /></label><div className="flex gap-2"><button type="submit" disabled={loading} className={`${internalButtonPrimary} min-h-10 px-4`}>{loading ? "Consultando…" : "Buscar"}</button><button type="button" onClick={() => { setQuery(""); setNotice(null); void load(""); }} className={`${internalButton} min-h-10 px-4`}>Limpar</button></div></form>
    {notice && <p role="status" className={`mt-4 ${notice.tone === "success" ? internalNoticeSuccess : internalNoticeError}`}>{notice.message}</p>}
    <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(18rem,0.8fr)_minmax(0,1.6fr)]">
      <section className={`${internalSurface} overflow-hidden p-0`} aria-label="Resultados de usuários"><div className="border-b border-divider px-4 py-3 text-sm font-semibold text-foreground">{loading ? "Consultando usuários…" : `${users.length} usuário${users.length === 1 ? "" : "s"} encontrado${users.length === 1 ? "" : "s"}`}</div><div className="divide-y divide-divider">{!loading && !users.length && <p className="p-4 text-sm text-text-muted">Nenhum usuário encontrado. Use ao menos dois caracteres para pesquisar por nome ou e-mail.</p>}{users.map(user => <button type="button" key={user.identity.id} onClick={() => { setSelectedId(user.identity.id); setConfirmRemoval(false); }} className={`block w-full px-4 py-3 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-module-accent/40 ${selectedId === user.identity.id ? internalSelected : "hover:bg-surface-elevated"}`}><span className="block text-sm font-medium text-foreground">{user.identity.name || user.identity.email}</span><span className="mt-1 block truncate text-xs text-text-muted">{user.identity.email}</span><span className={roleBadge(user.globalRole === "admin")}>{user.globalRole === "admin" ? "Administrador global" : "Usuário padrão"}</span></button>)}</div></section>
      <section className={`${internalSurface} p-5`} aria-live="polite">{!selected ? <p className="text-sm text-text-muted">Selecione um usuário para ver seus acessos.</p> : <>
        <div className="flex flex-col justify-between gap-4 border-b border-divider pb-4 sm:flex-row"><div><h2 className="text-lg font-semibold text-foreground">{selected.identity.name || selected.identity.email}</h2><p className="mt-1 text-sm text-text-muted">{selected.identity.email}</p><p className="mt-2 text-xs text-text-muted">UUID: {selected.identity.id}</p></div><span className={roleBadge(selected.globalRole === "admin")}>{selected.globalRole === "admin" ? "Administrador global" : "Usuário padrão"}</span></div>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2"><div className={internalSurfaceSubtle}><dt className="text-xs font-semibold uppercase tracking-wide text-text-muted">Identidade</dt><dd className="mt-1 text-foreground">{identityLabels[selected.identity.identityStatus]}</dd></div><div className={internalSurfaceSubtle}><dt className="text-xs font-semibold uppercase tracking-wide text-text-muted">Estado de acesso</dt><dd className="mt-1 text-foreground">{accessLabels[selected.accessState]}</dd></div></dl>
        <div className="mt-4 grid gap-4 xl:grid-cols-2"><MembershipList title="Memberships de agência" items={selected.agencyMemberships} empty="Nenhum membership de agência." /><MembershipList title="Memberships de marca" items={selected.brandMemberships} empty="Nenhum membership de marca." /></div>
        <div className={`${internalSurfaceSubtle} mt-5`}><h3 className="text-sm font-semibold text-foreground">Papel da plataforma</h3><p className="mt-1 text-sm text-text-muted">Esta ação atua somente em <code>perfis.role</code>. Não cria nem remove agências, marcas, ownership ou memberships.</p>{selected.globalRole === "admin" ? <div className="mt-4"><button type="button" disabled={saving} onClick={() => setConfirmRemoval(true)} className={internalButtonDanger}>Remover Administrador global</button>{confirmRemoval && <div className="mt-3 rounded-md border border-warning/35 bg-warning-soft p-3"><p className="text-sm text-warning">Confirme a remoção. A operação será bloqueada se este for o último administrador global ativo.</p><div className="mt-3 flex gap-2"><button type="button" disabled={saving} onClick={() => void updateRole("remove")} className={`${internalButtonDanger} min-h-9`}>{saving ? "Confirmando…" : "Confirmar remoção"}</button><button type="button" disabled={saving} onClick={() => setConfirmRemoval(false)} className={internalButton}>Cancelar</button></div></div>}</div> : <div className="mt-4">{confirmGrant ? <div className="rounded-md border border-success/35 bg-success-soft p-3"><p className="text-sm text-success">Conceder acesso de Administrador global à plataforma?</p><div className="mt-3 flex gap-2"><button type="button" disabled={saving} onClick={() => void updateRole("grant")} className={`${internalButtonPrimary} min-h-9`}>{saving ? "Confirmando…" : "Confirmar concessão"}</button><button type="button" disabled={saving} onClick={() => setConfirmGrant(false)} className={internalButton}>Cancelar</button></div></div> : <button type="button" disabled={saving || selected.identity.identityStatus === "disabled"} onClick={() => setConfirmGrant(true)} className={`${internalButtonPrimary} min-h-10 px-4`}>Conceder Administrador global</button>}</div>}</div>
      </>}</section>
    </div>
  </main>;
}
