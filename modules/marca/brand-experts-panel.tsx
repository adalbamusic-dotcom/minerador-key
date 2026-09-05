"use client";

import { useCallback, useEffect, useState } from "react";
import { Copy, Link2, Loader2, MessageCircle, Plus, UserRound, XCircle } from "lucide-react";
import { internalButton, internalButtonPrimary, internalField, internalSection } from "@/components/editorial/internal-page-visual";

type Expert = { id: string; displayName: string; specialty: string | null; status: string };
type Binding = { id: string; expertId: string; telegramUserId: string; telegramChatId: string; status: string; lastInteractionAt: string | null };

export function BrandExpertsPanel({ brandId }: { brandId: string }) {
  const [experts, setExperts] = useState<Expert[]>([]);
  const [bindings, setBindings] = useState<Binding[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [form, setForm] = useState({ displayName: "", specialty: "" });
  const [onboarding, setOnboarding] = useState<{ token: string; startLink: string | null; botUsername: string | null } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/marcas/${encodeURIComponent(brandId)}/experts`, { cache: "no-store" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Não foi possível carregar os especialistas.");
      setExperts(body.experts || []); setBindings(body.bindings || []);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível carregar os especialistas."); }
    finally { setLoading(false); }
  }, [brandId]);

  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);

  const createExpert = async () => {
    if (!form.displayName.trim()) return;
    setSaving(true); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/marcas/${encodeURIComponent(brandId)}/experts`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "create_expert", displayName: form.displayName, specialty: form.specialty || null }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Não foi possível criar o especialista.");
      setForm({ displayName: "", specialty: "" }); setNotice("Especialista criado. Gere um token de conexão quando estiver pronto."); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível criar o especialista."); }
    finally { setSaving(false); }
  };

  const issueToken = async (expertId: string) => {
    setSaving(true); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/marcas/${encodeURIComponent(brandId)}/experts`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "issue_onboarding_token", expertId }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Não foi possível gerar o vínculo.");
      setOnboarding(body.onboarding); setNotice("Token de conexão criado. Ele é de uso único e expira em 24 horas.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível gerar o vínculo."); }
    finally { setSaving(false); }
  };

  const revokeBinding = async (bindingId: string) => {
    setSaving(true); setError("");
    try {
      const response = await fetch(`/api/marcas/${encodeURIComponent(brandId)}/experts`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "revoke_binding", bindingId }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Não foi possível revogar o vínculo.");
      await load(); setNotice("Vínculo Telegram revogado.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível revogar o vínculo."); }
    finally { setSaving(false); }
  };

  const copy = async (value: string) => { await navigator.clipboard?.writeText(value); setNotice("Token copiado para a área de transferência."); };

  return <section className={`${internalSection} space-y-5`} aria-labelledby="brand-experts-title">
    <div className="flex flex-wrap items-start justify-between gap-4"><div><div className="flex items-center gap-2"><MessageCircle className="h-5 w-5 text-context-accent" aria-hidden="true" /><h2 id="brand-experts-title" className="text-lg font-semibold text-foreground">Especialistas externos</h2></div><p className="mt-2 max-w-3xl text-sm leading-6 text-text-muted">Especialistas não são usuários da Plataforma. O vínculo Telegram é por Marca, explícito, revogável e separado de membership.</p></div><span className="text-sm text-text-muted">Bot global · sem credencial por Marca</span></div>
    {error ? <p role="alert" className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p> : null}
    {notice ? <p role="status" className="rounded-md border border-divider bg-surface-subtle px-3 py-2 text-sm text-text-muted">{notice}</p> : null}
    <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] md:items-end"><label className="text-sm font-semibold text-foreground">Nome<input className={`${internalField} mt-2`} value={form.displayName} onChange={(event) => setForm({ ...form, displayName: event.target.value })} placeholder="Especialista de conteúdo" /></label><label className="text-sm font-semibold text-foreground">Especialidade<input className={`${internalField} mt-2`} value={form.specialty} onChange={(event) => setForm({ ...form, specialty: event.target.value })} placeholder="Ex.: dermatologia" /></label><button type="button" className={internalButtonPrimary} disabled={saving || !form.displayName.trim()} onClick={() => void createExpert()}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}Adicionar</button></div>
    {loading ? <p className="flex items-center gap-2 text-sm text-text-muted"><Loader2 className="h-4 w-4 animate-spin" />Carregando especialistas persistidos…</p> : experts.length ? <div className="divide-y divide-divider border-y border-divider">{experts.map((expert) => { const binding = bindings.find((item) => item.expertId === expert.id && item.status === "active"); return <div key={expert.id} className="flex flex-wrap items-center justify-between gap-4 py-4"><div className="flex min-w-0 items-start gap-3"><UserRound className="mt-0.5 h-4 w-4 shrink-0 text-context-accent" aria-hidden="true" /><div><p className="font-semibold text-foreground">{expert.displayName}</p><p className="mt-1 text-sm text-text-muted">{expert.specialty || "Especialidade não informada"} · {binding ? "Telegram conectado" : "Sem Telegram conectado"}</p>{binding ? <p className="mt-1 text-xs text-text-muted">Chat {binding.telegramChatId} · última interação {binding.lastInteractionAt ? new Date(binding.lastInteractionAt).toLocaleString("pt-BR") : "não registrada"}</p> : null}</div></div><div className="flex flex-wrap gap-2">{binding ? <button type="button" className={internalButton} disabled={saving} onClick={() => void revokeBinding(binding.id)}><XCircle className="h-4 w-4" />Revogar Telegram</button> : <button type="button" className={internalButton} disabled={saving} onClick={() => void issueToken(expert.id)}><Link2 className="h-4 w-4" />Conectar Telegram</button>}</div></div>; })}</div> : <p className="rounded-md border border-dashed border-divider p-4 text-sm text-text-muted">Nenhum especialista externo cadastrado para esta Marca.</p>}
    {onboarding ? <div className="space-y-3 border-t border-divider pt-4" role="status"><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-semibold text-foreground">Conexão Telegram pronta para compartilhar</p><p className="mt-1 text-sm leading-6 text-text-muted">O token abaixo é opaco, de uso único e não representa uma identidade interna. Compartilhe somente com o especialista.</p></div><button type="button" className={internalButton} onClick={() => setOnboarding(null)}>Fechar</button></div>{onboarding.startLink ? <div className="flex flex-wrap gap-2"><input className={`${internalField} min-w-[18rem] flex-1`} readOnly value={onboarding.startLink} aria-label="Link de conexão Telegram"/><button type="button" className={internalButton} onClick={() => void copy(onboarding.startLink || "")}><Copy className="h-4 w-4" />Copiar link</button></div> : <div className="flex flex-wrap gap-2"><input className={`${internalField} min-w-[18rem] flex-1 font-mono text-xs`} readOnly value={onboarding.token} aria-label="Token opaco de conexão Telegram"/><button type="button" className={internalButton} onClick={() => void copy(onboarding.token)}><Copy className="h-4 w-4" />Copiar token</button></div>}<p className="text-xs text-text-muted">{onboarding.botUsername ? `Bot: @${onboarding.botUsername}` : "Faça o health check Telegram no Admin para registrar o usuário do Bot e gerar o link direto."}</p></div> : null}
  </section>;
}
