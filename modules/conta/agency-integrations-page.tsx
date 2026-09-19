"use client";

import { type FormEvent, useMemo, useState } from "react";
import { AlertTriangle, Ban, Bot, CheckCircle2, Copy, Gauge, KeyRound, Link2, Loader2, ShieldCheck } from "lucide-react";
import type { AgencyIntegrationWorkspace, AgencyMcpProviderKey, AgencyMcpScope } from "@/lib/server/integration-governance";
import { internalBadge, internalButtonPrimary, internalField, internalNoticeError, internalNoticeSuccess, internalNoticeWarning, internalSurface, internalSurfaceSubtle } from "@/components/editorial/internal-page-visual";
import { useNoticeBridge } from "@/components/global-notice-center";

const panel = `${internalSurface} p-5 sm:p-6`;

function statusLabel(value: string) {
  return value === "active" ? "Ativo" : value === "ready" ? "READY" : value === "agency_distributed" ? "Distribuído pela Agência" : value;
}

function Result({ message, error = false }: { message: string; error?: boolean }) {
  return <p role={error ? "alert" : "status"} className={error ? internalNoticeError : internalNoticeSuccess}>{message}</p>;
}

export function AgencyIntegrationsPage({ initialData }: { initialData: AgencyIntegrationWorkspace }) {
  const [data, setData] = useState(initialData);
  const [selectedGrantId, setSelectedGrantId] = useState(initialData.platformGrants[0]?.id || "");
  const [selectedBrandId, setSelectedBrandId] = useState(initialData.brands[0]?.id || "");
  const [limitUnits, setLimitUnits] = useState("10");
  const [windowKind, setWindowKind] = useState<"none" | "calendar_day">("none");
  const [mcpProvider, setMcpProvider] = useState<AgencyMcpProviderKey>("chatgpt");
  const [mcpClientName, setMcpClientName] = useState("Cliente MCP do Redator");
  const [mcpScopes, setMcpScopes] = useState<AgencyMcpScope[]>(["writer.read", "writer.draft.write", "writer.media.brief"]);
  const [mcpBrandId, setMcpBrandId] = useState(initialData.brands[0]?.id || "");
  const [mcpDays, setMcpDays] = useState("7");
  const [issuedToken, setIssuedToken] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  useNoticeBridge({ notice: error || message, module: "conta", area: "Integrações da Agência", title: "Conta · Integrações", fallbackSeverity: error ? "ERROR" : "INFO" });

  const effectiveGrantId = data.platformGrants.some((grant) => grant.id === selectedGrantId) ? selectedGrantId : data.platformGrants[0]?.id || "";
  const effectiveBrandId = data.brands.some((brand) => brand.id === selectedBrandId) ? selectedBrandId : data.brands[0]?.id || "";
  const selectedGrant = useMemo(() => data.platformGrants.find((grant) => grant.id === effectiveGrantId) || null, [data.platformGrants, effectiveGrantId]);

  async function reload() {
    const response = await fetch(`/api/agencies/${data.agency.agencyRef}/integrations`, { cache: "no-store" });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || "Não foi possível atualizar a governança da integração.");
    setData(body as AgencyIntegrationWorkspace);
  }

  async function mutate(body: Record<string, unknown>, successMessage: string) {
    setSaving(true); setMessage(""); setError("");
    try {
      const response = await fetch(`/api/agencies/${data.agency.agencyRef}/integrations`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Não foi possível salvar a configuração.");
      await reload();
      setMessage(result.changed === false ? "A configuração já estava aplicada; nenhum novo vínculo foi criado." : successMessage);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível salvar a configuração.");
    } finally {
      setSaving(false);
    }
  }

  function distributeToBrand(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedGrant || !effectiveBrandId) return;
    void mutate({ action: "distribute_to_brand", grantId: selectedGrant.id, brandId: effectiveBrandId }, "Recurso disponibilizado para a Marca. O Minerador poderá consumir somente após a confirmação do binding.");
  }

  function saveQuota(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void mutate({ action: "save_quota", scopeType: "agency", limitUnits, windowKind }, "Quota da Agência salva. A unidade representa um alvo allintitle consultado.");
  }

  function registerMcpClient(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void mutate({ action: "register_mcp_client", providerKey: mcpProvider, clientName: mcpClientName, scopes: mcpScopes }, "Cliente MCP registrado. Use o endpoint e uma delegação por Marca para conectar o cliente externo.");
  }

  function revokeMcpClient(connectionId: string) {
    void mutate({ action: "revoke_mcp_client", connectionId }, "Cliente MCP revogado. As delegações continuam visíveis para auditoria e devem ser revogadas separadamente.");
  }

  async function createDelegation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true); setMessage(""); setError(""); setIssuedToken("");
    try {
      const response = await fetch(`/api/agencies/${data.agency.agencyRef}/integrations`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "create_writer_mcp_delegation", brandId: mcpBrandId, clientName: mcpClientName, scopes: mcpScopes, days: Number(mcpDays) }) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || result.code || "Não foi possível criar a delegação MCP.");
      setIssuedToken(result.delegation?.token || "");
      await reload();
      setMessage("Delegação criada. Copie o bearer agora; por segurança, o token completo não será mostrado novamente.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível criar a delegação MCP.");
    } finally { setSaving(false); }
  }

  function toggleMcpScope(scope: AgencyMcpScope) {
    setMcpScopes((current) => current.includes(scope) ? current.filter((value) => value !== scope) : [...current, scope]);
  }

  async function copyToken() {
    if (!issuedToken || !navigator.clipboard) return;
    await navigator.clipboard.writeText(issuedToken);
    setMessage("Bearer copiado para a área de transferência.");
  }

  return <main className="mx-auto max-w-6xl space-y-7 p-5 sm:p-8">
    <header className="flex flex-wrap items-start justify-between gap-5">
      <div><p className="text-sm font-medium text-text-muted">Integrações da Agência</p><h1 className="mt-2 text-3xl font-semibold tracking-tight">Distribua recursos às Marcas</h1><p className="mt-3 max-w-3xl text-base leading-7 text-text-muted">A Plataforma concede o recurso à Agência; a Agência escolhe quais Marcas podem consumi-lo. Nenhum segredo ou fallback de ambiente participa deste fluxo.</p></div>
      <div className="flex items-center gap-2 rounded-md border border-context-accent/35 px-3 py-2 text-sm font-semibold text-context-accent"><Link2 className="h-4 w-4" aria-hidden="true" />{data.agency.name}</div>
    </header>

    {message ? <Result message={message} /> : null}
    {error ? <Result message={error} error /> : null}

    <section className={panel} aria-labelledby="agency-mcp-title">
      <div className="flex items-start gap-3"><Bot className="mt-0.5 h-5 w-5 shrink-0 text-context-accent" aria-hidden="true" /><div><h2 id="agency-mcp-title" className="text-xl font-semibold">MCP do Redator</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-text-muted">A Agência registra os clientes ChatGPT, Claude, Gemini ou outro cliente MCP. Todos usam o mesmo servidor do Redator, com escopo explícito por Marca e sem aprovação ou publicação automática.</p></div></div>
      <div className="mt-5 grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
        <div className={internalSurfaceSubtle}>
          <h3 className="text-sm font-semibold">Endpoint do servidor</h3>
          <code className="mt-2 block break-all rounded border border-divider bg-surface px-3 py-2 text-xs text-context-accent">{data.mcpEndpoint}</code>
          <p className="mt-3 text-sm leading-6 text-text-muted">Transporte: Streamable HTTP · autenticação: bearer delegado. Em produção, o endpoint precisa estar publicado em HTTPS. A conexão do cliente fica pendente até o token de uma Marca ser criado.</p>
          <p className="mt-2 text-xs leading-5 text-text-muted">O token completo aparece uma única vez. O banco guarda somente o hash, prefixo, escopos, validade e auditoria das chamadas.</p>
        </div>
        {data.canManage ? <form className={internalSurfaceSubtle} onSubmit={registerMcpClient}>
          <h3 className="text-sm font-semibold">Registrar cliente</h3>
          <div className="mt-3 space-y-3"><label className="block text-sm font-semibold">Cliente<select className={`${internalField} mt-2`} value={mcpProvider} onChange={(event) => setMcpProvider(event.target.value as AgencyMcpProviderKey)} disabled={saving}><option value="chatgpt">ChatGPT</option><option value="claude">Claude</option><option value="gemini">Gemini</option><option value="custom_mcp">Outro cliente MCP</option></select></label><label className="block text-sm font-semibold">Nome desta conexão<input className={`${internalField} mt-2`} value={mcpClientName} onChange={(event) => setMcpClientName(event.target.value)} disabled={saving} maxLength={120} required /></label><fieldset><legend className="text-sm font-semibold">Escopos padrão</legend><div className="mt-2 grid gap-2 sm:grid-cols-3">{(["writer.read", "writer.draft.write", "writer.media.brief"] as AgencyMcpScope[]).map((scope) => <label key={scope} className="flex items-center gap-2 text-xs text-text-muted"><input type="checkbox" checked={mcpScopes.includes(scope)} onChange={() => toggleMcpScope(scope)} disabled={saving} />{scope}</label>)}</div></fieldset><button type="submit" className={`${internalButtonPrimary} min-h-11`} disabled={saving || !mcpClientName.trim() || !mcpScopes.length}>{saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Bot className="h-4 w-4" aria-hidden="true" />}Registrar cliente MCP</button></div>
        </form> : <div className={internalSurfaceSubtle}><h3 className="text-sm font-semibold">Acesso somente leitura</h3><p className="mt-2 text-sm leading-6 text-text-muted">Somente o owner ou administrador da Agência pode registrar clientes e emitir delegações.</p></div>}
      </div>
      <div className="mt-5 grid gap-3 md:grid-cols-2">{(data.mcpConnections || []).map((connection) => <div key={connection.id} className={internalSurfaceSubtle}><div className="flex items-start justify-between gap-3"><div><h3 className="font-semibold">{connection.providerName}</h3><p className="mt-1 text-xs text-text-muted">{connection.endpoint}</p></div><span className={`${internalBadge} ${connection.lifecycleStatus === "ready" ? "border-success/40 text-success" : connection.lifecycleStatus === "revoked" ? "border-danger/40 text-danger" : "border-warning/40 text-warning"}`}>{connection.lifecycleStatus === "ready" ? <CheckCircle2 className="mr-1 h-4 w-4" aria-hidden="true" /> : <AlertTriangle className="mr-1 h-4 w-4" aria-hidden="true" />}{connection.lifecycleStatus === "ready" ? "Pronto" : connection.lifecycleStatus === "revoked" ? "Revogado" : "Cadastro pendente"}</span></div><p className="mt-3 text-xs leading-5 text-text-muted">{connection.clientName || ""}{connection.scopes.length ? ` · ${connection.scopes.join(", ")}` : ""}</p>{data.canManage && connection.lifecycleStatus !== "revoked" ? <button type="button" className="mt-3 inline-flex min-h-9 items-center gap-2 rounded border border-danger/40 px-3 text-xs font-semibold text-danger" onClick={() => revokeMcpClient(connection.id)} disabled={saving}><Ban className="h-3.5 w-3.5" aria-hidden="true" />Revogar cliente</button> : null}</div>)}{!(data.mcpConnections || []).length ? <p className="text-sm text-text-muted">Nenhum cliente MCP registrado nesta Agência.</p> : null}</div>
      <div className="mt-5 border-t border-divider pt-5"><div className="flex items-start gap-3"><KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-context-accent" aria-hidden="true" /><div><h3 className="text-sm font-semibold">Delegação por Marca</h3><p className="mt-1 text-xs leading-5 text-text-muted">A delegação é o que autoriza o cliente a operar o Redator daquela Marca. Crie uma por cliente e revogue quando necessário.</p></div></div>{data.canManage ? <form className="mt-4 grid gap-3 md:grid-cols-[1fr_0.9fr_0.6fr_auto] md:items-end" onSubmit={createDelegation}><label className="block text-sm font-semibold">Marca<select className={`${internalField} mt-2`} value={mcpBrandId} onChange={(event) => setMcpBrandId(event.target.value)} disabled={saving} required><option value="">Selecione uma Marca</option>{data.brands.map((brand) => <option key={brand.id} value={brand.id}>{brand.name}</option>)}</select></label><label className="block text-sm font-semibold">Cliente<input className={`${internalField} mt-2`} value={mcpClientName} onChange={(event) => setMcpClientName(event.target.value)} disabled={saving} required /></label><label className="block text-sm font-semibold">Validade (dias)<input className={`${internalField} mt-2`} type="number" min="1" max="30" value={mcpDays} onChange={(event) => setMcpDays(event.target.value)} disabled={saving} required /></label><button type="submit" className={`${internalButtonPrimary} min-h-11`} disabled={saving || !mcpBrandId || !mcpScopes.length}><KeyRound className="h-4 w-4" aria-hidden="true" />Criar bearer</button></form> : null}{issuedToken ? <div className="mt-4 rounded border border-warning/40 bg-warning/5 p-3"><p className="text-xs font-semibold text-warning">Bearer exibido uma única vez</p><code className="mt-2 block break-all text-xs text-text">{issuedToken}</code><button type="button" className={`${internalButtonPrimary} mt-3 min-h-10`} onClick={() => void copyToken()}><Copy className="h-4 w-4" aria-hidden="true" />Copiar bearer</button></div> : null}<ul className="mt-4 divide-y divide-divider">{(data.writerMcpDelegations || []).map((delegation) => <li key={delegation.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm"><span><strong>{delegation.brandName}</strong><span className="ml-2 text-text-muted">{delegation.clientName} · {delegation.tokenPrefix} · expira {new Date(delegation.expiresAt).toLocaleDateString("pt-BR")}</span></span>{delegation.revokedAt ? <span className="text-text-muted">Revogada</span> : data.canManage ? <button type="button" className="inline-flex min-h-9 items-center gap-2 rounded border border-danger/40 px-3 text-xs font-semibold text-danger" onClick={() => void mutate({ action: "revoke_writer_mcp_delegation", delegationId: delegation.id, brandId: delegation.brandId }, "Delegação MCP revogada.")} disabled={saving}><Ban className="h-3.5 w-3.5" aria-hidden="true" />Revogar</button> : <span className="text-success">Ativa</span>}</li>)}</ul><div className="mt-5 border-t border-divider pt-4"><h3 className="text-sm font-semibold">Auditoria recente</h3>{data.writerMcpAuditEvents?.length ? <ul className="mt-2 divide-y divide-divider">{data.writerMcpAuditEvents.map((event) => <li key={event.id} className="py-2 text-xs leading-5 text-text-muted"><span className="font-semibold text-text">{event.brandName}</span> · {event.toolName} · {event.resultCode} · {new Date(event.occurredAt).toLocaleString("pt-BR")}{event.documentId ? ` · ${event.documentId}` : ""}</li>)}</ul> : <p className="mt-2 text-xs text-text-muted">Nenhuma chamada MCP registrada para as Marcas desta Agência.</p>}</div></div>
    </section>

    <section className={panel} aria-labelledby="agency-integration-chain-title">
      <div className="flex items-start gap-3"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-context-accent" aria-hidden="true" /><div><h2 id="agency-integration-chain-title" className="text-xl font-semibold">Golden Path · DataForSEO</h2><p className="mt-2 text-sm leading-6 text-text-muted">Plataforma → Connection READY → Agência → binding da Marca → Minerador. A ausência de qualquer etapa bloqueia o consumo de forma explícita.</p></div></div>
      {!data.capabilities.length ? <p className={`mt-5 ${internalNoticeWarning}`}>A capability <code>dataforseo.allintitle</code> ainda não foi confirmada no catálogo remoto.</p> : null}
      {data.platformGrants.length ? <div className="mt-5 grid gap-3 md:grid-cols-2">{data.platformGrants.map((grant) => <div key={grant.id} className={internalSurfaceSubtle}><div className="flex items-start justify-between gap-3"><div><h3 className="font-semibold">{grant.capabilityKey}</h3><p className="mt-1 text-sm text-text-muted">Origem: Plataforma · ambiente: {grant.environment}</p></div><span className={`${internalBadge} ${grant.bindingReady && grant.connectionReady ? "border-success/40 text-success" : "border-warning/40 text-warning"}`}>{grant.bindingReady && grant.connectionReady ? <CheckCircle2 className="mr-1 h-4 w-4" aria-hidden="true" /> : <AlertTriangle className="mr-1 h-4 w-4" aria-hidden="true" />}{grant.bindingReady && grant.connectionReady ? "Pronto" : "Pendente"}</span></div><p className="mt-3 text-sm leading-6 text-text-muted">Binding da Agência: {grant.bindingReady ? "confirmado" : "ausente"} · Connection: {grant.connectionReady ? "READY" : "não utilizável"}.</p></div>)}</div> : <p className="mt-5 text-sm leading-6 text-text-muted">Nenhuma concessão Plataforma → Agência foi confirmada. O Admin da Plataforma precisa conceder a capability antes da distribuição para uma Marca.</p>}
    </section>

    <section className="grid gap-6 xl:grid-cols-2">
      <section className={panel} aria-labelledby="brand-distribution-title">
        <div className="flex items-start gap-3"><Link2 className="mt-0.5 h-5 w-5 shrink-0 text-context-accent" aria-hidden="true" /><div><h2 id="brand-distribution-title" className="text-lg font-semibold">Disponibilizar para uma Marca</h2><p className="mt-2 text-sm leading-6 text-text-muted">Cria somente o binding <code>agency_distributed</code> para uma Marca pertencente a esta Agência.</p></div></div>
        {data.canManage ? <form className="mt-5 space-y-4" onSubmit={distributeToBrand}><label className="block text-sm font-semibold">Concessão da Plataforma<select className={`${internalField} mt-2`} value={effectiveGrantId} onChange={(event) => setSelectedGrantId(event.target.value)} disabled={saving || !data.platformGrants.length} required><option value="">Selecione uma concessão</option>{data.platformGrants.map((grant) => <option key={grant.id} value={grant.id}>{grant.capabilityKey} · {grant.connectionReady ? "READY" : "Pendente"}</option>)}</select></label><label className="block text-sm font-semibold">Marca autorizada<select className={`${internalField} mt-2`} value={effectiveBrandId} onChange={(event) => setSelectedBrandId(event.target.value)} disabled={saving || !data.brands.length} required><option value="">Selecione uma Marca</option>{data.brands.map((brand) => <option key={brand.id} value={brand.id}>{brand.name}</option>)}</select></label><button type="submit" className={`${internalButtonPrimary} min-h-11`} disabled={saving || !selectedGrant || !selectedGrant.bindingReady || !selectedGrant.connectionReady || !effectiveBrandId}>{saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Link2 className="h-4 w-4" aria-hidden="true" />}Disponibilizar recurso</button></form> : <p className="mt-5 text-sm leading-6 text-text-muted">Seu acesso é somente leitura. O owner ou administrador da Agência deve distribuir o recurso.</p>}
        <div className="mt-6 border-t border-divider pt-5"><h3 className="text-sm font-semibold">Bindings ativos das Marcas</h3>{data.brandBindings.length ? <ul className="mt-3 divide-y divide-divider">{data.brandBindings.map((binding) => <li key={binding.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm"><span><strong>{binding.brandName}</strong><span className="ml-2 text-text-muted">{statusLabel(binding.sourceKind)}</span></span><span className="text-text-muted">{statusLabel(binding.lifecycleStatus)}</span></li>)}</ul> : <p className="mt-3 text-sm text-text-muted">Nenhuma Marca recebeu este recurso ainda.</p>}</div>
      </section>

      <section className={panel} aria-labelledby="agency-quota-title">
        <div className="flex items-start gap-3"><Gauge className="mt-0.5 h-5 w-5 shrink-0 text-context-accent" aria-hidden="true" /><div><h2 id="agency-quota-title" className="text-lg font-semibold">Quota da Agência</h2><p className="mt-2 text-sm leading-6 text-text-muted">Cada alvo consultado ao DataForSEO consome uma unidade, mesmo quando vários alvos estão no mesmo lote técnico.</p></div></div>
        {data.canManage ? <form className="mt-5 space-y-4" onSubmit={saveQuota}><label className="block text-sm font-semibold">Quantidade de unidades<input className={`${internalField} mt-2`} type="number" min="0" step="1" value={limitUnits} onChange={(event) => setLimitUnits(event.target.value)} disabled={saving} required /></label><label className="block text-sm font-semibold">Janela<select className={`${internalField} mt-2`} value={windowKind} onChange={(event) => setWindowKind(event.target.value as typeof windowKind)} disabled={saving}><option value="none">Sem período</option><option value="calendar_day">Dia UTC</option></select></label><button type="submit" className={`${internalButtonPrimary} min-h-11`} disabled={saving || !data.platformGrants.length}>{saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Gauge className="h-4 w-4" aria-hidden="true" />}Salvar quota</button></form> : <p className="mt-5 text-sm leading-6 text-text-muted">Seu acesso é somente leitura. A quota é governada pela Agência, não pelo navegador.</p>}
        <div className="mt-6 border-t border-divider pt-5"><h3 className="text-sm font-semibold">Quotas confirmadas</h3>{data.quotas.length ? <ul className="mt-3 divide-y divide-divider">{data.quotas.map((quota) => <li key={quota.id} className="py-3 text-sm"><div className="flex flex-wrap items-center justify-between gap-2"><strong>{quota.scopeName}</strong><span className="text-text-muted">{quota.limitUnits === null ? "Ilimitada" : `${quota.limitUnits} unidades`} · {quota.windowKind}</span></div><p className="mt-1 text-text-muted">{quota.capabilityKey} · {statusLabel(quota.status)}</p></li>)}</ul> : <p className="mt-3 text-sm text-text-muted">Nenhuma quota DataForSEO configurada para esta Agência.</p>}</div>
      </section>
    </section>
  </main>;
}
