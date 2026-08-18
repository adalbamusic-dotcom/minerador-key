"use client";

import { useEffect, useState } from "react";
import { Loader2, MailCheck } from "lucide-react";
import { internalButton, internalField, internalSurface } from "@/components/editorial/internal-page-visual";

type CommunicationConfig = {
  provider: "resend";
  status: "DISABLED" | "NOT_CONFIGURED" | "VALIDATING" | "READY" | "ERROR";
  health: "DISABLED" | "MISSING_CREDENTIAL" | "MISSING_SENDER" | "VAULT_UNAVAILABLE" | "READY" | "PROVIDER_ERROR";
  senderName: string | null;
  senderEmail: string | null;
  domain: string | null;
  credentialConfigured: boolean;
  validatedAt: string | null;
  lastErrorCode: string | null;
};

const field = `${internalField} mt-1 text-base`;

export default function CommunicationAdminPanel() {
  const [config, setConfig] = useState<CommunicationConfig | null>(null);
  const [form, setForm] = useState({ senderName: "", senderEmail: "", domain: "", apiKey: "", destination: "" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/communication", { cache: "no-store" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Não foi possível carregar a comunicação.");
      const next = body.config as CommunicationConfig;
      setConfig(next);
      setForm((current) => ({ ...current, senderName: next.senderName || "", senderEmail: next.senderEmail || "", domain: next.domain || "", destination: next.senderEmail || current.destination }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível carregar a comunicação.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, []);

  const submit = async (action: "save" | "test_connection" | "send_test_email") => {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/admin/communication", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, provider: "resend", ...form }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Não foi possível concluir a operação.");
      if (body.config) setConfig(body.config);
      setForm((current) => ({ ...current, apiKey: "" }));
      const providerDiagnostic = typeof body.providerErrorMessage === "string" ? `Falha do provider${body.providerErrorType ? ` (${body.providerErrorType})` : ""}${body.providerHttpStatus ? ` HTTP ${body.providerHttpStatus}` : ""}: ${body.providerErrorMessage}` : null;
      setNotice(action === "save" ? "Configuração salva. Testar conexão enviará um e-mail real e poderá liberar READY." : providerDiagnostic || (body.deliveryStatus === "SENT" ? "E-mail de teste enviado. Provider validado como READY." : body.deliveryStatus === "NOT_CONFIGURED" ? "Provider ainda não está pronto para teste." : "O provider não confirmou o envio."));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível concluir a operação.");
    } finally {
      setSaving(false);
    }
  };

  return <main className="min-w-0 p-4 sm:p-6">
    <p className="max-w-3xl text-sm leading-6 text-foreground/70">Provider global da plataforma, herdado por agências e marcas.</p>
    {error ? <p role="alert" className="mt-4 rounded-md border border-danger/35 bg-danger-soft p-3 text-sm text-danger">{error}</p> : null}
    {notice ? <p role="status" className="mt-4 rounded-md border border-foreground/15 bg-foreground/5 p-3 text-sm">{notice}</p> : null}
    {loading ? <p className="mt-6 flex items-center gap-2 text-sm text-text-muted"><Loader2 className="h-4 w-4 animate-spin" />Carregando configuração…</p> : <section className={`${internalSurface} mt-6 max-w-2xl`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Provider global</h2>
          <p className="mt-1 text-sm text-foreground/70">A credencial nunca é recuperada depois de salva.</p>
          {config?.credentialConfigured ? <p className="mt-2 text-sm text-foreground/80">Credencial configurada</p> : <p className="mt-2 text-sm text-foreground/65">Credencial ainda não configurada</p>}
        </div>
        <div className="text-right"><span className="rounded-md border border-foreground/20 px-3 py-2 text-sm font-semibold">{config?.status || "NOT_CONFIGURED"}</span><p className="mt-2 text-xs font-semibold text-foreground/70">Saúde: {config?.health || "MISSING_CREDENTIAL"}</p></div>
      </div>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <label className="block text-sm">Provider<input className={field} value="Resend" disabled /></label>
        <label className="block text-sm">Nome do remetente<input className={field} value={form.senderName} onChange={(event) => setForm({ ...form, senderName: event.target.value })} required /></label>
        <label className="block text-sm">E-mail do remetente<input className={field} type="email" value={form.senderEmail} onChange={(event) => setForm({ ...form, senderEmail: event.target.value })} required /></label>
        <label className="block text-sm">Domínio<input className={field} value={form.domain} onChange={(event) => setForm({ ...form, domain: event.target.value })} /></label>
        <label className="block text-sm sm:col-span-2">API key<input className={field} type="password" autoComplete="new-password" value={form.apiKey} onChange={(event) => setForm({ ...form, apiKey: event.target.value })} placeholder={config?.credentialConfigured ? "Credencial configurada; informe apenas para trocar" : "Informe durante a configuração"} /></label>
        <label className="block text-sm sm:col-span-2">Destino controlado do teste<input className={field} type="email" value={form.destination} onChange={(event) => setForm({ ...form, destination: event.target.value })} placeholder="Usa o e-mail do remetente se ficar vazio" /></label>
      </div>
      <p id="communication-test-warning" role="note" className="mt-4 rounded-md border border-foreground/20 bg-foreground/5 p-3 text-sm text-foreground">Testar conexão envia um e-mail real para o destino informado. Use somente um destinatário controlado.</p>
      <div className="mt-6 flex flex-wrap gap-3">
        <button type="button" className={internalButton} disabled={saving} onClick={() => void submit("save")}>{saving ? "Salvando…" : "Salvar configuração"}</button>
        <button type="button" aria-describedby="communication-test-warning" className="inline-flex min-h-10 items-center gap-2 rounded-md border border-foreground/20 px-3 text-sm font-semibold hover:bg-foreground/10 disabled:opacity-60" disabled={saving || !config?.credentialConfigured || config.status === "NOT_CONFIGURED" || config.status === "DISABLED"} onClick={() => void submit("test_connection")}><MailCheck className="h-4 w-4" />Testar conexão</button>
        <button type="button" className="inline-flex min-h-10 items-center rounded-md border border-foreground/20 px-3 text-sm font-semibold hover:bg-foreground/10 disabled:opacity-60" disabled={saving || !config?.credentialConfigured} onClick={() => void submit("send_test_email")}>Enviar e-mail de teste</button>
      </div>
      <p className="mt-4 text-sm text-foreground/65">Agências e marcas não configuram credenciais próprias. O Supabase Auth continua responsável por confirmação e recuperação de senha.</p>
    </section>}
  </main>;
}
