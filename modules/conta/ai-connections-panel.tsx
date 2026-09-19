"use client";

import { useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { Bot, Loader2 } from "lucide-react";
import { internalButtonDanger, internalButtonPrimary, internalField, internalNoticeError, internalNoticeSuccess, internalSurfaceSubtle } from "@/components/editorial/internal-page-visual";
import { WRITER_MCP_SCOPE_LABELS, type ConsentBrandOption, type WriterMcpClientSummary, type WriterMcpScope } from "@/lib/redator/mcp-consent-domain";

export type AiConnectionsInitialState = {
  enabled: boolean;
  clients: WriterMcpClientSummary[];
  brands: ConsentBrandOption[];
  scopes: readonly WriterMcpScope[];
  unavailable: string | null;
};

const checkbox = "mt-1 h-4 w-4 shrink-0 accent-action-accent";

function formatDate(value: string | null) {
  if (!value) return "nunca";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

/*
 * O estado inicial chega do servidor; este componente só muta e recarrega em
 * resposta a ações do usuário. O `mcp_client` da URL é o identificador que o
 * aplicativo devolveu na mensagem `grant_required`.
 */
export function AiConnectionsPanel({ initial }: { initial: AiConnectionsInitialState }) {
  const searchParams = useSearchParams();
  const [data, setData] = useState(initial);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(initial.unavailable);
  const [busy, setBusy] = useState(false);
  const [clientId, setClientId] = useState(() => searchParams.get("mcp_client") || "");
  const [clientName, setClientName] = useState("");
  const [brandIds, setBrandIds] = useState<string[]>([]);
  const [scopes, setScopes] = useState<WriterMcpScope[]>(() => [...initial.scopes]);

  const reload = async () => {
    const response = await fetch("/api/oauth/grants", { cache: "no-store" });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || "Não foi possível recarregar as conexões.");
    setData({ ...(body as Omit<AiConnectionsInitialState, "unavailable">), unavailable: null });
  };

  const toggle = <T extends string>(list: T[], value: T) => (list.includes(value) ? list.filter((item) => item !== value) : [...list, value]);

  const authorize = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/oauth/grants", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ oauthClientId: clientId.trim(), clientName: clientName.trim() || undefined, brandIds, scopes }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Não foi possível autorizar o aplicativo.");
      setMessage(`Acesso registrado para ${body.grants?.length || brandIds.length} Marca(s). Volte ao aplicativo e repita o pedido.`);
      setBrandIds([]);
      await reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível autorizar o aplicativo.");
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (grantId: string) => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/oauth/grants", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ grantId }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Não foi possível revogar o acesso.");
      setMessage("Acesso revogado. A próxima chamada do aplicativo será recusada.");
      await reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível revogar o acesso.");
    } finally {
      setBusy(false);
    }
  };

  if (!data.enabled) return <p className="text-sm leading-6 text-text-muted">A conexão de aplicativos de IA por OAuth ainda não está ativa nesta plataforma. Quando estiver, os aplicativos autorizados aparecem aqui.</p>;

  const activeClients = data.clients.filter((client) => client.grants.some((grant) => grant.status === "active"));

  return <div className="space-y-5">
    {message ? <p role="status" className={internalNoticeSuccess}>{message}</p> : null}
    {error ? <p role="alert" className={internalNoticeError}>{error}</p> : null}

    {activeClients.length ? <ul className="grid gap-3 md:grid-cols-2">{activeClients.map((client) => <li key={client.oauthClientId} className={internalSurfaceSubtle}>
      <div className="flex items-start gap-3"><Bot className="mt-0.5 h-4 w-4 shrink-0 text-context-accent" aria-hidden="true" /><div className="min-w-0">
        <p className="text-sm font-semibold">{client.clientName}</p>
        <p className="mt-1 text-sm text-text-muted">Último uso: {formatDate(client.lastUsedAt)}</p>
      </div></div>
      <ul className="mt-3 space-y-2">{client.grants.filter((grant) => grant.status === "active").map((grant) => <li key={grant.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-divider px-3 py-2">
        <span className="text-sm"><span className="font-medium">{grant.brandName}</span><span className="text-text-muted"> · {grant.scopes.map((scope) => WRITER_MCP_SCOPE_LABELS[scope].title).join(", ")}</span></span>
        <button type="button" className={internalButtonDanger} disabled={busy} onClick={() => void revoke(grant.id)}>Revogar</button>
      </li>)}</ul>
    </li>)}</ul> : <p className="text-sm leading-6 text-text-muted">Nenhum aplicativo autorizado. Ao conectar o ChatGPT ou outro cliente, a tela de autorização aparece sozinha; se o aplicativo pedir para escolher Marcas, use o formulário abaixo.</p>}

    <form onSubmit={authorize} className={internalSurfaceSubtle}>
      <h3 className="text-sm font-semibold">Autorizar um aplicativo já conectado</h3>
      <p className="mt-1 text-sm leading-6 text-text-muted">Use quando o aplicativo informar que não há Marca autorizada. O identificador vem na mensagem do próprio aplicativo.</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="block text-sm font-semibold">Identificador do aplicativo<input className={`${internalField} mt-2`} value={clientId} onChange={(event) => setClientId(event.target.value)} required disabled={busy} autoComplete="off" /></label>
        <label className="block text-sm font-semibold">Nome (opcional)<input className={`${internalField} mt-2`} value={clientName} onChange={(event) => setClientName(event.target.value)} placeholder="ChatGPT" disabled={busy} autoComplete="off" /></label>
      </div>
      <fieldset className="mt-4 space-y-2">
        <legend className="text-sm font-semibold">Marcas</legend>
        {data.brands.length ? data.brands.map((brand) => <label key={brand.brandId} className="flex cursor-pointer items-start gap-3 rounded-md border border-divider px-3 py-2 hover:bg-surface">
          <input type="checkbox" className={checkbox} checked={brandIds.includes(brand.brandId)} onChange={() => setBrandIds((current) => toggle(current, brand.brandId))} disabled={busy} />
          <span className="text-sm font-medium">{brand.brandName}</span>
        </label>) : <p className="text-sm text-text-muted">Sua conta não tem Marca com acesso ao Redator em uma Agência ativa.</p>}
      </fieldset>
      <fieldset className="mt-4 space-y-2">
        <legend className="text-sm font-semibold">Permissões</legend>
        {data.scopes.map((scope) => <label key={scope} className="flex cursor-pointer items-start gap-3 rounded-md border border-divider px-3 py-2 hover:bg-surface">
          <input type="checkbox" className={checkbox} checked={scopes.includes(scope)} onChange={() => setScopes((current) => toggle(current, scope))} disabled={busy} />
          <span><span className="block text-sm font-medium">{WRITER_MCP_SCOPE_LABELS[scope].title}</span><span className="block text-sm leading-6 text-text-muted">{WRITER_MCP_SCOPE_LABELS[scope].description}</span></span>
        </label>)}
      </fieldset>
      <button type="submit" className={`${internalButtonPrimary} mt-4`} disabled={busy || !clientId.trim() || !brandIds.length || !scopes.length}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
        Autorizar aplicativo
      </button>
    </form>
  </div>;
}
