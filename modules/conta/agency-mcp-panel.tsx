"use client";

import { type FormEvent, useState } from "react";
import { AlertTriangle, Ban, Bot, CheckCircle2, Copy, KeyRound, Loader2, RotateCcw, ShieldCheck } from "lucide-react";
import { InfoHint } from "@/components/info-hint";
import { internalBadge, internalButton, internalButtonDanger, internalButtonPrimary, internalField, internalNoticeWarning, internalSurface, internalSurfaceSubtle } from "@/components/editorial/internal-page-visual";
import type { AgencyIntegrationWorkspace, AgencyMcpProviderKey, AgencyMcpScope } from "@/lib/server/integration-governance";
import { MCP_CONNECTION_STATUS_LABELS, MCP_OAUTH_REASON_LABELS } from "@/lib/redator/mcp-connection-status";
import { WRITER_MCP_DEFAULT_SCOPES, WRITER_MCP_SCOPE_LABELS, WRITER_MCP_SCOPES } from "@/lib/redator/mcp-consent-domain";

type AgencyMcpPanelProps = {
  data: AgencyIntegrationWorkspace;
  saving: boolean;
  agencyRef: string;
  mutate: (body: Record<string, unknown>, successMessage: string) => Promise<void>;
  reload: () => Promise<void>;
  notify: (message: string, isError?: boolean) => void;
};

type GuideKey = "chatgpt" | "claude" | "custom";

const panel = `${internalSurface} p-5 sm:p-6`;
const okBadge = `${internalBadge} border-success/40 text-success`;
const warnBadge = `${internalBadge} border-warning/40 text-warning`;
const offBadge = `${internalBadge} border-divider text-text-muted`;
const dangerBadge = `${internalBadge} border-danger/40 text-danger`;

function formatDateTime(value: string | null) {
  if (!value) return "nunca";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function scopeTitles(scopes: readonly AgencyMcpScope[]) {
  return scopes.map((scope) => WRITER_MCP_SCOPE_LABELS[scope].title).join(", ");
}

/*
 * A pergunta que este painel responde, em ordem: a plataforma está pronta?
 * como o usuário conecta o cliente dele? quem já conectou e o que pode fazer?
 * O bearer de diagnóstico fica por último e só aparece quando a plataforma
 * ainda o aceita.
 */
export function AgencyMcpPanel({ data, saving, agencyRef, mutate, reload, notify }: AgencyMcpPanelProps) {
  const [guide, setGuide] = useState<GuideKey>("chatgpt");
  const [provider, setProvider] = useState<AgencyMcpProviderKey>("chatgpt");
  const [clientName, setClientName] = useState("Cliente MCP do Minerador Key");
  const [scopes, setScopes] = useState<AgencyMcpScope[]>([...WRITER_MCP_DEFAULT_SCOPES]);
  const [showRevokedClients, setShowRevokedClients] = useState(false);
  const [showRevokedGrants, setShowRevokedGrants] = useState(false);
  const [bearerBrandId, setBearerBrandId] = useState(data.brands[0]?.id || "");
  const [bearerDays, setBearerDays] = useState("7");
  const [issuedToken, setIssuedToken] = useState("");
  const [bearerBusy, setBearerBusy] = useState(false);

  const readiness = data.mcpOAuth;
  const oauthReady = readiness.status === "ready";
  const httpsEndpoint = data.mcpEndpoint.startsWith("https://");
  const activeGrants = data.writerMcpGrants.filter((grant) => grant.status === "active");
  const revokedGrants = data.writerMcpGrants.filter((grant) => grant.status !== "active");
  const activeClients = data.mcpConnections.filter((connection) => connection.lifecycleStatus !== "revoked");
  const revokedClients = data.mcpConnections.filter((connection) => connection.lifecycleStatus === "revoked");
  const activeDelegations = data.writerMcpDelegations.filter((delegation) => !delegation.revokedAt);
  const busy = saving || bearerBusy;

  const copy = async (value: string, label: string) => {
    if (!navigator.clipboard) return;
    await navigator.clipboard.writeText(value);
    notify(`${label} copiado para a área de transferência.`);
  };

  const toggleScope = (scope: AgencyMcpScope) => setScopes((current) => (current.includes(scope) ? current.filter((item) => item !== scope) : [...current, scope]));

  const registerClient = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void mutate({ action: "register_mcp_client", providerKey: provider, clientName, scopes },
      oauthReady ? "Cliente registrado. Agora cada usuário conecta o próprio aplicativo seguindo o passo a passo." : "Cliente registrado. A conexão só ficará disponível quando a plataforma estiver com OAuth pronto.");
  };

  const createBearer = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBearerBusy(true);
    setIssuedToken("");
    try {
      const response = await fetch(`/api/agencies/${agencyRef}/integrations`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create_writer_mcp_delegation", brandId: bearerBrandId, clientName, scopes, days: Number(bearerDays) }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || result.code || "Não foi possível criar o bearer de diagnóstico.");
      setIssuedToken(result.delegation?.token || "");
      await reload();
      notify("Bearer de diagnóstico criado. Copie agora; o token completo não será mostrado de novo.");
    } catch (cause) {
      notify(cause instanceof Error ? cause.message : "Não foi possível criar o bearer de diagnóstico.", true);
    } finally {
      setBearerBusy(false);
    }
  };

  const guides: Record<GuideKey, { title: string; steps: Array<{ text: string; hint?: { title: string; description: string } }> }> = {
    chatgpt: {
      title: "ChatGPT",
      steps: [
        { text: "No ChatGPT, abra Configurações → Aplicativos e conectores → Configurações avançadas e ative o Modo desenvolvedor.", hint: { title: "Modo desenvolvedor", description: "É o que libera conectores personalizados com ações de escrita. A disponibilidade depende do plano da conta ChatGPT." } },
        { text: "Em Plugins, clique em Novo plugin. Nome livre, URL do servidor igual ao endpoint acima, Autenticação = OAuth. Não preencha as configurações avançadas de OAuth.", hint: { title: "OAuth", description: "O ChatGPT descobre o servidor de autorização pelo metadata desta plataforma e se registra sozinho. Client ID, secret e URLs manuais não são necessários." } },
        { text: "Clique em Criar e depois em Entrar com o plugin. O login desta plataforma abre; entre com a sua conta normal." },
        { text: "Na tela Autorizar acesso ao Redator, escolha as Marcas e as permissões e aprove.", hint: { title: "Consentimento", description: "As Marcas e permissões ficam registradas aqui na Agência e podem ser revogadas a qualquer momento. O aplicativo nunca aprova, publica ou exclui conteúdo." } },
        { text: "No chat, ative o app e peça: \"Mostre o perfil da conexão do Redator\". O app lista as Marcas autorizadas." },
      ],
    },
    claude: {
      title: "Claude",
      steps: [
        { text: "No claude.ai Pro ou Max, abra Customize → Connectors → + → Add custom connector. Em Team ou Enterprise, um Owner precisa adicionar o conector em Organization settings → Connectors; depois cada usuário se conecta em Customize → Connectors.", hint: { title: "Claude Code e Desktop", description: "Conectores remotos do Claude são chamados pela infraestrutura da Anthropic e exigem um servidor acessível pela internet. Claude Code também pode usar `claude mcp add --transport http minerador-key <endpoint>`." } },
        { text: "Informe o nome Minerador Key e a URL HTTPS exibida acima. Deixe Client ID e Client Secret em Advanced settings vazios: o endpoint publica OAuth e registro dinâmico." },
        { text: "Clique em Connect. O login desta plataforma abre; entre com sua conta normal e confira Marca e permissões na tela de consentimento." },
        { text: "Selecione platform.read, as áreas necessárias e, se você quer delegar decisões aceitas no chat, marque platform.decide conscientemente. Esta permissão vem desmarcada; provider.spend também." },
        { text: "Ative o conector na conversa e teste nesta ordem: get_platform_guide → get_platform_state → find_topic_in_platform → declare_subjects em preview. O preview não grava." },
      ],
    },
    custom: {
      title: "Outro cliente MCP",
      steps: [
        { text: "Qualquer cliente compatível com MCP Streamable HTTP e OAuth 2.1 com registro dinâmico funciona: informe o endpoint, escolha OAuth e conclua o login.", hint: { title: "Registro dinâmico", description: "O cliente se registra sozinho no servidor de autorização (RFC 7591). Clientes que exigem client ID e secret fixos precisam de um cadastro manual no Supabase, feito pela Plataforma." } },
        { text: "Autorize as Marcas e permissões na tela de consentimento." },
        { text: "Clientes sem suporte a OAuth só se conectam com o bearer de diagnóstico, quando a Plataforma o habilita. Não use bearer em integração pública." },
      ],
    },
  };

  const readinessBadge = readiness.status === "ready"
    ? <span className={okBadge}><CheckCircle2 className="mr-1 h-4 w-4" aria-hidden="true" />OAuth pronto</span>
    : readiness.status === "pending"
      ? <span className={warnBadge}><AlertTriangle className="mr-1 h-4 w-4" aria-hidden="true" />Pendente</span>
      : <span className={offBadge}>Desativado</span>;

  const checklist = [
    { ok: httpsEndpoint, label: "Servidor MCP publicado em HTTPS", detail: data.mcpEndpoint, hint: "Endereço que os aplicativos usam para chamar as ferramentas do Minerador Key. Precisa ser HTTPS e acessível pela internet para conectores remotos do Claude." },
    { ok: readiness.status !== "disabled" && Boolean(data.mcpMetadataUrl), label: "Metadata OAuth do recurso", detail: data.mcpMetadataUrl || "não publicado", hint: "Documento público que diz aos aplicativos qual servidor de autorização emite tokens para este MCP. Sem ele o aplicativo responde que o servidor não implementa OAuth." },
    { ok: oauthReady, label: "Servidor de autorização (Supabase)", detail: readiness.reason ? MCP_OAUTH_REASON_LABELS[readiness.reason] : `${readiness.issuer}${readiness.checkedAt ? ` · verificado ${formatDateTime(readiness.checkedAt)}` : ""}`, hint: "É quem faz o login e emite os tokens. Fica no projeto Supabase da plataforma e é ligado pela Plataforma, não pela Agência." },
  ];

  return <section className={panel} aria-labelledby="agency-mcp-title">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex items-start gap-3"><Bot className="mt-0.5 h-5 w-5 shrink-0 text-context-accent" aria-hidden="true" /><div>
        <h2 id="agency-mcp-title" className="text-xl font-semibold">MCP do Minerador Key</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-text-muted">ChatGPT, Claude e outros aplicativos de IA usam o mesmo servidor para ler e operar os módulos autorizados desta Agência. Cada usuário conecta o aplicativo com a própria conta e escolhe Marcas e permissões. Decisões delegadas exigem a permissão opcional, prévia e aceite específico no chat; publicação e exclusão não ficam disponíveis.</p>
      </div></div>
      <div className="flex items-center gap-2">{readinessBadge}<InfoHint title="Estado do OAuth" description="Pronto: aplicativos conseguem fazer login e pedir consentimento. Pendente: falta uma etapa da plataforma, descrita na lista abaixo. Desativado: a conexão por OAuth está desligada nesta plataforma." /></div>
    </div>

    <div className="mt-5 grid gap-5 xl:grid-cols-2">
      <div className={internalSurfaceSubtle}>
        <h3 className="text-sm font-semibold">Endpoint e estado da plataforma</h3>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <code className="min-w-0 flex-1 break-all rounded border border-divider bg-surface px-3 py-2 text-xs text-context-accent">{data.mcpEndpoint}</code>
          <button type="button" className={internalButton} onClick={() => void copy(data.mcpEndpoint, "Endpoint")}><Copy className="h-4 w-4" aria-hidden="true" />Copiar</button>
        </div>
        <ul className="mt-4 space-y-3">{checklist.map((item) => <li key={item.label} className="flex items-start gap-3 text-sm">
          {item.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden="true" /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />}
          <span className="min-w-0"><span className="inline-flex items-center gap-1 font-medium">{item.label}<InfoHint title={item.label} description={item.hint} /></span><span className="mt-0.5 block break-all text-xs leading-5 text-text-muted">{item.detail}</span></span>
        </li>)}</ul>
      </div>

      <div className={internalSurfaceSubtle}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">Como conectar</h3>
          <div className="flex gap-1" role="tablist" aria-label="Aplicativo">{(Object.keys(guides) as GuideKey[]).map((key) => <button key={key} type="button" role="tab" aria-selected={guide === key} className={`${internalButton} ${guide === key ? "border-module-accent/50 bg-surface-elevated" : ""}`} onClick={() => setGuide(key)}>{guides[key].title}</button>)}</div>
        </div>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm leading-6">{guides[guide].steps.map((step, index) => <li key={index}><span>{step.text}</span>{step.hint ? <span className="ml-1 inline-flex align-middle"><InfoHint title={step.hint.title} description={step.hint.description} /></span> : null}</li>)}</ol>
        {!oauthReady ? <p className={`mt-3 ${internalNoticeWarning}`}>O login vai falhar enquanto o estado for {readiness.status === "disabled" ? "Desativado" : "Pendente"}. Resolva a etapa marcada na lista ao lado antes de conectar.</p> : null}
      </div>
    </div>

    <div className="mt-5 grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
      {data.canManage ? <form className={internalSurfaceSubtle} onSubmit={registerClient}>
        <h3 className="inline-flex items-center gap-1 text-sm font-semibold">Registrar aplicativo nesta Agência<InfoHint title="Registro na Agência" description="Registra que a Agência usa este aplicativo e quais permissões sugere. Não cria token: cada usuário conecta o aplicativo dele pelo passo a passo e escolhe as Marcas no consentimento." /></h3>
        <div className="mt-3 space-y-3">
          <label className="block text-sm font-semibold">Aplicativo<select className={`${internalField} mt-2`} value={provider} onChange={(event) => setProvider(event.target.value as AgencyMcpProviderKey)} disabled={busy}><option value="chatgpt">ChatGPT</option><option value="claude">Claude</option><option value="gemini">Gemini</option><option value="custom_mcp">Outro cliente MCP</option></select></label>
          <label className="block text-sm font-semibold">Nome desta conexão<input className={`${internalField} mt-2`} value={clientName} onChange={(event) => setClientName(event.target.value)} disabled={busy} maxLength={120} required /></label>
          <fieldset><legend className="inline-flex items-center gap-1 text-sm font-semibold">Permissões sugeridas<InfoHint title="Permissões sugeridas" description="Aparecem pré-marcadas na tela de consentimento do usuário. Ele pode reduzir; a decisão final é dele." /></legend>
            <div className="mt-2 space-y-2">{WRITER_MCP_SCOPES.map((scope) => <label key={scope} className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1 h-4 w-4 accent-action-accent" checked={scopes.includes(scope)} onChange={() => toggleScope(scope)} disabled={busy} /><span><span className="font-medium">{WRITER_MCP_SCOPE_LABELS[scope].title}</span><span className="block text-xs leading-5 text-text-muted">{WRITER_MCP_SCOPE_LABELS[scope].description}</span></span></label>)}</div>
          </fieldset>
          <button type="submit" className={`${internalButtonPrimary} min-h-11`} disabled={busy || !clientName.trim() || !scopes.length}>{saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Bot className="h-4 w-4" aria-hidden="true" />}Registrar aplicativo</button>
        </div>
      </form> : <div className={internalSurfaceSubtle}><h3 className="text-sm font-semibold">Acesso somente leitura</h3><p className="mt-2 text-sm leading-6 text-text-muted">Somente o owner ou administrador da Agência registra aplicativos e revoga acessos. Você pode conectar o seu próprio aplicativo pelo passo a passo.</p></div>}

      <div>
        <h3 className="text-sm font-semibold">Aplicativos registrados</h3>
        {activeClients.length ? <div className="mt-3 grid gap-3 md:grid-cols-2">{activeClients.map((connection) => <div key={connection.id} className={internalSurfaceSubtle}>
          <div className="flex items-start justify-between gap-3"><div><p className="font-semibold">{connection.providerName}</p><p className="mt-1 text-xs text-text-muted">{connection.clientName}</p></div>
            <span className={connection.displayStatus === "connected" ? okBadge : connection.displayStatus === "awaiting_login" ? warnBadge : offBadge}>{MCP_CONNECTION_STATUS_LABELS[connection.displayStatus]}</span></div>
          <p className="mt-3 text-xs leading-5 text-text-muted">{connection.activeGrantCount ? `${connection.activeGrantCount} acesso(s) ativo(s)` : "Nenhum usuário conectou ainda"} · sugere: {scopeTitles(connection.scopes)}</p>
          {data.canManage ? <button type="button" className={`${internalButtonDanger} mt-3`} onClick={() => void mutate({ action: "revoke_mcp_client", connectionId: connection.id }, "Aplicativo removido da Agência. Os acessos já concedidos continuam listados abaixo e podem ser revogados um a um.")} disabled={busy}><Ban className="h-3.5 w-3.5" aria-hidden="true" />Remover aplicativo</button> : null}
        </div>)}</div> : <p className="mt-3 text-sm text-text-muted">Nenhum aplicativo registrado nesta Agência.</p>}
        {revokedClients.length ? <button type="button" className="mt-3 text-xs font-semibold text-text-muted underline-offset-2 hover:underline" onClick={() => setShowRevokedClients((current) => !current)}>{showRevokedClients ? "Ocultar" : "Mostrar"} {revokedClients.length} registro(s) removido(s)</button> : null}
        {showRevokedClients ? <ul className="mt-2 space-y-1 text-xs text-text-muted">{revokedClients.map((connection) => <li key={connection.id}>{connection.providerName} · {connection.clientName} · removido {formatDateTime(connection.updatedAt)}</li>)}</ul> : null}
      </div>
    </div>

    <div className="mt-6 border-t border-divider pt-5">
      <div className="flex items-start gap-3"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-context-accent" aria-hidden="true" /><div>
        <h3 className="inline-flex items-center gap-1 text-sm font-semibold">Acessos autorizados<InfoHint title="Acessos autorizados" description="Cada linha é um usuário que autorizou um aplicativo a operar o Redator de uma Marca. Revogar bloqueia a próxima chamada na hora, mesmo que o aplicativo ainda tenha token. Reativar devolve o acesso sem novo consentimento." /></h3>
        <p className="mt-1 text-xs leading-5 text-text-muted">Concedidos pelos próprios usuários na tela de consentimento. A Agência audita, revoga e reativa.</p>
      </div></div>
      {activeGrants.length ? <div className="mt-4 overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-left text-xs uppercase tracking-wide text-text-muted"><th className="py-2 pr-3">Usuário</th><th className="py-2 pr-3">Aplicativo</th><th className="py-2 pr-3">Marca</th><th className="py-2 pr-3">Permissões</th><th className="py-2 pr-3">Último uso</th><th className="py-2"></th></tr></thead>
        <tbody className="divide-y divide-divider">{activeGrants.map((grant) => <tr key={grant.id}><td className="py-2 pr-3 font-medium">{grant.actorEmail || grant.actorUserId.slice(0, 8)}</td><td className="py-2 pr-3">{grant.clientName}</td><td className="py-2 pr-3">{grant.brandName}</td><td className="py-2 pr-3 text-text-muted">{scopeTitles(grant.scopes)}</td><td className="py-2 pr-3 text-text-muted">{formatDateTime(grant.lastUsedAt)}</td><td className="py-2 text-right">{data.canManage ? <button type="button" className={internalButtonDanger} onClick={() => void mutate({ action: "revoke_writer_mcp_grant", grantId: grant.id }, "Acesso revogado. A próxima chamada do aplicativo será recusada.")} disabled={busy}><Ban className="h-3.5 w-3.5" aria-hidden="true" />Revogar</button> : null}</td></tr>)}</tbody></table></div>
        : <p className="mt-3 text-sm text-text-muted">Nenhum usuário autorizou um aplicativo ainda. O primeiro login pelo passo a passo cria a primeira linha aqui.</p>}
      {revokedGrants.length ? <button type="button" className="mt-3 text-xs font-semibold text-text-muted underline-offset-2 hover:underline" onClick={() => setShowRevokedGrants((current) => !current)}>{showRevokedGrants ? "Ocultar" : "Mostrar"} {revokedGrants.length} acesso(s) revogado(s)</button> : null}
      {showRevokedGrants ? <ul className="mt-2 divide-y divide-divider">{revokedGrants.map((grant) => <li key={grant.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-xs text-text-muted"><span>{grant.actorEmail || grant.actorUserId.slice(0, 8)} · {grant.clientName} · {grant.brandName} · revogado {formatDateTime(grant.revokedAt)}</span>{data.canManage ? <button type="button" className={internalButton} onClick={() => void mutate({ action: "reactivate_writer_mcp_grant", grantId: grant.id }, "Acesso reativado.")} disabled={busy}><RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />Reativar</button> : null}</li>)}</ul> : null}
    </div>

    <div className="mt-6 border-t border-divider pt-5">
      <h3 className="text-sm font-semibold">Auditoria recente</h3>
      {data.writerMcpAuditEvents.length ? <ul className="mt-2 divide-y divide-divider">{data.writerMcpAuditEvents.map((event) => <li key={event.id} className="py-2 text-xs leading-5 text-text-muted"><span className="font-semibold text-text">{event.brandName}</span> · {event.toolName} · {event.resultCode} · {formatDateTime(event.occurredAt)} · {event.principal === "grant" ? "OAuth" : "bearer"}{event.documentId ? ` · ${event.documentId}` : ""}</li>)}</ul> : <p className="mt-2 text-xs text-text-muted">Nenhuma chamada registrada para as Marcas desta Agência.</p>}
    </div>

    {data.bearerDiagnosticsAllowed || activeDelegations.length ? <div className="mt-6 border-t border-divider pt-5">
      <div className="flex items-start gap-3"><KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-context-accent" aria-hidden="true" /><div>
        <h3 className="inline-flex items-center gap-1 text-sm font-semibold">Diagnóstico interno (bearer)<InfoHint title="Bearer de diagnóstico" description="Token manual para testar o servidor com um cliente MCP de desenvolvimento. Não serve para ChatGPT ou Claude, que só aceitam OAuth. Em produção só é aceito quando a Plataforma habilita MCP_ALLOW_REMOTE_BEARER." /></h3>
        {!data.bearerDiagnosticsAllowed ? <p className={`mt-2 ${internalNoticeWarning}`}>A produção não aceita mais estes tokens. Revogue os que ainda estão ativos.</p> : <p className="mt-1 text-xs leading-5 text-text-muted">O token completo aparece uma única vez. O banco guarda somente o hash, prefixo, escopos e validade.</p>}
      </div></div>
      {data.bearerDiagnosticsAllowed && data.canManage ? <form className="mt-4 grid gap-3 md:grid-cols-[1fr_0.6fr_auto] md:items-end" onSubmit={createBearer}>
        <label className="block text-sm font-semibold">Marca<select className={`${internalField} mt-2`} value={bearerBrandId} onChange={(event) => setBearerBrandId(event.target.value)} disabled={busy} required><option value="">Selecione uma Marca</option>{data.brands.map((brand) => <option key={brand.id} value={brand.id}>{brand.name}</option>)}</select></label>
        <label className="block text-sm font-semibold">Validade (dias)<input className={`${internalField} mt-2`} type="number" min="1" max="30" value={bearerDays} onChange={(event) => setBearerDays(event.target.value)} disabled={busy} required /></label>
        <button type="submit" className={`${internalButton} min-h-11`} disabled={busy || !bearerBrandId || !scopes.length}>{bearerBusy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <KeyRound className="h-4 w-4" aria-hidden="true" />}Criar bearer de diagnóstico</button>
      </form> : null}
      {issuedToken ? <div className={`mt-4 ${internalNoticeWarning}`}><p className="text-xs font-semibold">Bearer exibido uma única vez</p><code className="mt-2 block break-all text-xs">{issuedToken}</code><button type="button" className={`${internalButton} mt-3`} onClick={() => void copy(issuedToken, "Bearer")}><Copy className="h-4 w-4" aria-hidden="true" />Copiar bearer</button></div> : null}
      {data.writerMcpDelegations.length ? <ul className="mt-4 divide-y divide-divider">{data.writerMcpDelegations.map((delegation) => <li key={delegation.id} className="flex flex-wrap items-center justify-between gap-3 py-2 text-sm"><span><strong>{delegation.brandName}</strong><span className="ml-2 text-text-muted">{delegation.clientName} · {delegation.tokenPrefix} · expira {new Date(delegation.expiresAt).toLocaleDateString("pt-BR")}</span></span>{delegation.revokedAt ? <span className="text-text-muted">Revogada</span> : data.canManage ? <button type="button" className={internalButtonDanger} onClick={() => void mutate({ action: "revoke_writer_mcp_delegation", delegationId: delegation.id, brandId: delegation.brandId }, "Bearer de diagnóstico revogado.")} disabled={busy}><Ban className="h-3.5 w-3.5" aria-hidden="true" />Revogar</button> : <span className={dangerBadge}>Ativa</span>}</li>)}</ul> : null}
    </div> : null}
  </section>;
}
