"use client";

import { useEffect, useState } from "react";
import { internalButton, internalButtonPrimary, internalField } from "@/components/editorial/internal-page-visual";
import { useNoticeBridge } from "@/components/global-notice-center";

type SanitizedConnection = {
  customerIdRef: string;
  status: string;
  validatedAt: string | null;
};

type ConnectionResponse = { success?: boolean; message?: string; connection?: SanitizedConnection | null };

const field = `${internalField} mt-2`;
const secondaryButton = `${internalButton} px-4`;
const primaryButton = `${internalButtonPrimary} min-h-10 px-4`;

function connectionUrl(brandId: string) { return `/api/minerador/marcas/${encodeURIComponent(brandId)}/google-ads/conexao`; }
function formatValidationDate(value: string) { const date = new Date(value); return Number.isNaN(date.getTime()) ? "Data de validação indisponível" : date.toLocaleString("pt-BR", { dateStyle: "medium", timeStyle: "short" }); }

function normalizeCustomerIdInput(customerId: string) { return customerId.replace(/[\s-]/g, ""); }
function validateClientInput(customerId: string) { return /^\d{10}$/.test(normalizeCustomerIdInput(customerId)) ? null : "Informe o Customer ID numérico de 10 dígitos, com ou sem hífens."; }

export function GoogleAdsConnectionPanel({ brandId }: { brandId: string }) {
  const [connection, setConnection] = useState<SanitizedConnection | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [forbidden, setForbidden] = useState(false);
  const [message, setMessage] = useState("");
  useNoticeBridge({ notice: message, module: "marca", area: "Google Ads", title: "Marca · Google Ads", fallbackSeverity: "INFO" });
  const [replaceConfirmed, setReplaceConfirmed] = useState(false);
  const [form, setForm] = useState({ customerId: "" });

  useEffect(() => {
    let active = true;
    const loadConnection = async () => {
      setLoading(true); setForbidden(false);
      try {
        const response = await fetch(connectionUrl(brandId), { method: "GET", cache: "no-store" });
        const body = await response.json() as ConnectionResponse;
        if (!response.ok || !body.success) {
          if (active) { setForbidden(response.status === 403); setMessage(body.message || "Não foi possível consultar a conexão Google Ads desta marca."); }
          return;
        }
        if (active) {
          setConnection(body.connection || null);
        }
      } catch { if (active) setMessage("Não foi possível consultar a conexão Google Ads desta marca."); }
      finally { if (active) setLoading(false); }
    };
    void loadConnection();
    return () => { active = false; };
  }, [brandId]);

  const submit = async () => {
    setMessage("");
    const validationError = validateClientInput(form.customerId);
    if (validationError) { setMessage(validationError); return; }
    if (connection && !replaceConfirmed) { setMessage("Confirme a substituição da conexão ativa antes de revalidar a conta."); return; }
    setSubmitting(true);
    try {
      const response = await fetch(connectionUrl(brandId), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ customerId: normalizeCustomerIdInput(form.customerId) }) });
      const body = await response.json() as ConnectionResponse;
      if (!response.ok || !body.success || !body.connection) { setForbidden(response.status === 403); setMessage(body.message || "Não foi possível validar a conexão Google Ads."); return; }
      setConnection(body.connection); setForm({ customerId: "" }); setReplaceConfirmed(false); setMessage("Customer ID Google Ads salvo e validado para esta marca.");
    } catch { setMessage("Não foi possível validar a conexão Google Ads. Tente novamente."); }
    finally { setSubmitting(false); }
  };

  return <section aria-labelledby="google-ads-connection-title" className="mt-8 border-t border-divider pt-8">
    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between"><div><h2 id="google-ads-connection-title" className="text-lg font-semibold text-foreground">Integração Google Ads</h2><p className="mt-2 max-w-3xl text-base leading-7 text-text-muted">Vincule somente o Customer ID da conta desta marca. A autenticação da conta é fornecida pela Connection global da Plataforma.</p></div>{connection && <span className="inline-flex w-fit items-center rounded-md border border-success/50 bg-success-soft px-3 py-2 text-sm font-semibold text-success">Customer ID vinculado</span>}</div>
    {loading ? <p role="status" aria-live="polite" className="mt-6 text-sm leading-6 text-text-muted">Consultando o estado da conexão…</p> : forbidden ? <p role="alert" className="mt-6 border-y border-warning/35 bg-warning-soft px-4 py-3 text-sm leading-6 text-warning">Você não possui a permissão <strong>minerador:manage</strong> para configurar a conexão Google Ads desta marca.</p> : <>
      {connection && <div className="mt-6 grid gap-4 border-y border-divider py-5 sm:grid-cols-2"><div><p className="text-sm font-semibold text-text-muted">Customer ID aplicável</p><p className="mt-1 text-base text-foreground">Google Ads · {connection.customerIdRef}</p></div><div><p className="text-sm font-semibold text-text-muted">Estado</p><p className="mt-1 text-base text-foreground">{connection.status === "validated" ? "Validado pela Connection global" : "Pendente de validação"}</p>{connection.validatedAt ? <p className="mt-1 text-sm text-text-muted">Validado em {formatValidationDate(connection.validatedAt)}</p> : null}</div></div>}
      <label className="mt-6 block text-sm font-semibold text-foreground">Google Ads Customer ID<input inputMode="numeric" autoComplete="off" value={form.customerId} onChange={event => setForm({ customerId: event.target.value })} className={field} placeholder="10 dígitos, com ou sem hífens" aria-describedby="google-ads-id-help"/></label>
      <p id="google-ads-id-help" className="mt-2 text-sm leading-6 text-text-muted">Informe somente o Customer ID da conta anunciante. O valor é normalizado no servidor e não volta completo ao navegador.</p>
      {connection && <label className="mt-6 flex items-start gap-3 border-y border-divider py-4 text-sm leading-6 text-text-muted"><input type="checkbox" checked={replaceConfirmed} onChange={event => setReplaceConfirmed(event.target.checked)} className="mt-1 h-4 w-4 shrink-0 accent-module-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-module-accent/30"/>Confirmo que desejo substituir o Customer ID ativo desta marca após nova validação pela Connection global.</label>}
      {message && <p role={message.startsWith("Customer ID Google Ads salvo") ? "status" : "alert"} aria-live="polite" className={`mt-6 border-y px-4 py-3 text-sm leading-6 ${message.startsWith("Customer ID Google Ads salvo") ? "border-success/35 bg-success-soft text-success" : "border-warning/35 bg-warning-soft text-warning"}`}>{message}</p>}
      <div className="mt-6 flex flex-wrap gap-3"><button type="button" onClick={() => void submit()} disabled={submitting || (connection !== null && !replaceConfirmed)} className={primaryButton}>{submitting ? "Salvando e validando…" : connection ? "Revalidar e substituir Customer ID" : "Salvar Customer ID"}</button>{connection && <button type="button" onClick={() => { setForm({ customerId: "" }); setReplaceConfirmed(false); setMessage(""); }} disabled={submitting} className={secondaryButton}>Cancelar alteração</button>}</div>
    </>}
  </section>;
}
