"use client";

import { type FormEvent, useEffect, useState } from "react";
import { Database, KeyRound, Loader2, Plus, ShieldCheck, ToggleLeft, ToggleRight } from "lucide-react";
import type { IntegrationAdminHealthCheck, PlatformIntegrationsSnapshot } from "@/lib/server/platform-integrations-admin";
import { DEEPSEEK_BASE_URL, DEEPSEEK_DEFAULT_MODEL } from "@/lib/deepseek-model-config";
import { useNoticeBridge } from "@/components/global-notice-center";

const capabilityOperations = ["ai_generation", "keyword_discovery", "keyword_metrics", "allintitle", "serp_compatibility", "transactional_email", "speech_transcription", "storage_media", "youtube_video_metadata", "telegram_message_send", "telegram_file_fetch"] as const;
const environments = ["development", "test", "staging", "production"] as const;
type IntegrationView = "overview" | "connections" | "agencies" | "usage";
type SupportedProviderKey = "google_ads" | "dataforseo" | "deepseek" | "google_cloud" | "youtube_data" | "telegram";

const integrationViews: Array<{ id: IntegrationView; label: string }> = [
  { id: "overview", label: "Integrações" },
  { id: "connections", label: "Configurações das APIs" },
  { id: "agencies", label: "Distribuição por Agência" },
  { id: "usage", label: "Consumo" },
];

const supportedApiDefinitions: Array<{
  key: SupportedProviderKey;
  name: string;
  group: "Google Ads" | "DataForSEO" | "IA" | "Google Cloud" | "YouTube" | "Telegram";
  origin: string;
  description: string;
}> = [
  {
    key: "google_ads",
    name: "Google Ads",
    group: "Google Ads",
    origin: "Plataforma",
    description: "Infraestrutura server-side fixa da Plataforma; na homologação, o recurso fica disponível para Agências ativas.",
  },
  {
    key: "dataforseo",
    name: "DataForSEO",
    group: "DataForSEO",
    origin: "Plataforma",
    description: "Connection global da Plataforma; Agências ativas usam o resource sem grant por operação.",
  },
  {
    key: "deepseek",
    name: "DeepSeek",
    group: "IA",
    origin: "Plataforma",
    description: `Connection global da Plataforma; modelo DeepSeek V4 Pro (${DEEPSEEK_DEFAULT_MODEL}).`,
  },
  {
    key: "google_cloud",
    name: "Google Cloud Media",
    group: "Google Cloud",
    origin: "Plataforma",
    description: "Speech-to-Text e Cloud Storage compartilhados; uma Connection global e nenhuma credencial de módulo.",
  },
  {
    key: "youtube_data",
    name: "YouTube Data API",
    group: "YouTube",
    origin: "Plataforma",
    description: "Metadados públicos server-side; sem download, transcrição ou OAuth de canal.",
  },
  {
    key: "telegram",
    name: "Telegram Bot",
    group: "Telegram",
    origin: "Plataforma",
    description: "Bot global com webhook único; especialistas entram por binding explícito e token opaco de uso único.",
  },
];

const sourceContracts = [
  {
    name: "Google Ads",
    source: "Plataforma",
    contract: "Infraestrutura server-side da Plataforma → Brand autorizada; Customer ID da Brand não é exigido para pesquisa",
    providerKeys: ["google_ads"],
  },
  {
    name: "DataForSEO",
    source: "Plataforma ou Agência",
    contract: "Connection global READY → Agência ativa → Brand autorizada; capability identifica a operação; sem fallback silencioso",
    providerKeys: ["dataforseo"],
  },
  {
    name: "IA",
    source: "Plataforma",
    contract: "Connection global READY → Agência ativa → Brand autorizada; modelo operacional separado",
    providerKeys: ["deepseek"],
  },
  {
    name: "Google Cloud Media",
    source: "Plataforma",
    contract: "Connection global READY → Agency ativa → Brand autorizada; Speech e Storage são operações compartilhadas",
    providerKeys: ["google_cloud"],
  },
  {
    name: "YouTube Data",
    source: "Plataforma",
    contract: "API key restrita global → Agency ativa → Brand autorizada; somente metadados públicos",
    providerKeys: ["youtube_data"],
  },
  {
    name: "Telegram",
    source: "Plataforma",
    contract: "Bot global → Brand autorizada → especialista vinculado; sem Connection, grant ou quota por módulo",
    providerKeys: ["telegram"],
  },
] as const;

const panel = "rounded-lg border border-foreground/15 bg-foreground/5 p-4";
const input = "mt-1 min-h-10 w-full rounded-md border border-foreground/20 bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-context-accent disabled:cursor-not-allowed disabled:opacity-60";
const primary = "inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-accent px-3 text-sm font-semibold text-foreground hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-context-accent disabled:cursor-not-allowed disabled:opacity-50";
const secondary = "inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-foreground/20 px-3 text-sm font-semibold text-foreground hover:bg-foreground/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-context-accent disabled:cursor-not-allowed disabled:opacity-50";

type ApiFormState = {
  label: string;
  dataforseoLogin: string;
  dataforseoPassword: string;
  deepseekApiKey: string;
  googleAdsRefreshToken: string;
  googleCloudServiceAccount: string;
  googleCloudBucketName: string;
  youtubeDataApiKey: string;
  youtubeHealthVideoId: string;
  telegramBotToken: string;
  telegramWebhookUrl: string;
};

const emptyApiForm: ApiFormState = {
  label: "",
  dataforseoLogin: "",
  dataforseoPassword: "",
  deepseekApiKey: "",
  googleAdsRefreshToken: "",
  googleCloudServiceAccount: "",
  googleCloudBucketName: "",
  youtubeDataApiKey: "",
  youtubeHealthVideoId: "",
  telegramBotToken: "",
  telegramWebhookUrl: "",
};

function statusLabel(value: string) {
  return value.replaceAll("_", " ").toUpperCase();
}

function healthStageLabel(value: string | null) {
  if (value === "oauth_token") return "OAuth token";
  if (value === "developer_token") return "Developer Token";
  if (value === "login_customer") return "Login Customer ID (MCC)";
  if (value === "api_request") return "API request";
  if (value === "models_endpoint") return "Endpoint de modelos";
  if (value === "credential") return "Credencial";
  if (value === "bucket_metadata") return "Metadata do bucket";
  if (value === "credential_and_client") return "Credencial e client";
  if (value === "videos_list") return "Vídeos metadata";
  if (value === "get_me") return "Telegram getMe";
  if (value === "get_webhook_info") return "Telegram webhook";
  return value;
}

type AdminConnection = PlatformIntegrationsSnapshot["platformConnections"][number];

function googleCloudConnectionStatus(connection: AdminConnection | undefined) {
  if (!connection) return { label: "Não configurado", tone: "text-pending", detail: "Nenhuma Connection global do Google Cloud foi encontrada." };
  if (!connection.secretConfigured) return { label: "Não configurado", tone: "text-pending", detail: "A Connection existe, mas a Service Account ainda não foi salva." };
  if (connection.lifecycleStatus === "error") {
    return { label: "Erro", tone: "text-danger", detail: connection.healthCheck.message || "A validação da Connection Google Cloud falhou." };
  }
  if (connection.lifecycleStatus !== "ready") return { label: "Configurada", tone: "text-warning", detail: "Service Account configurada. Teste Speech e Cloud Storage separadamente; a Connection ainda aguarda validação." };
  return { label: "Connection READY", tone: "text-success", detail: "A Connection foi validada. Isso não confirma que o bucket do Cloud Storage está configurado ou acessível." };
}

function googleCloudHealthStatus(check: IntegrationAdminHealthCheck | null, bucketName: string | null, operation: "speech" | "storage") {
  if (operation === "storage" && !bucketName) return { label: "Não configurado", tone: "text-pending", detail: "Bucket: Não configurado · Status: Não testado." };
  if (!check) return { label: "Não testado", tone: "text-warning", detail: operation === "storage" ? `Bucket: ${bucketName} · Status: Não testado.` : "Status: Não testado." };
  if (check.status === "ready") return { label: "READY", tone: "text-success", detail: operation === "storage" ? `Bucket: ${bucketName} · Metadata acessível; gravação não exercitada.` : "Credencial e client confirmados." };
  const code = check.code || "PROVIDER_ERROR";
  return { label: "ERROR", tone: "text-danger", detail: `${operation === "storage" ? `Bucket: ${bucketName} · ` : ""}${code}${check.message ? ` · ${check.message}` : ""}` };
}

function formatDate(value: string | null) {
  if (!value) return "Sem validade final";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Data não informada" : date.toLocaleDateString("pt-BR");
}

function emptyState(message: string) {
  return <p className="mt-3 rounded-md border border-dashed border-foreground/20 p-3 text-sm text-foreground/70">{message}</p>;
}

function sourceEvidence(data: PlatformIntegrationsSnapshot, providerKeys: readonly string[]) {
  const providers = data.providers.filter((provider) => providerKeys.some((key) => key === provider.providerKey));
  const connections = data.platformConnections.filter((connection) => providerKeys.some((key) => key === connection.providerKey));
  const providerLabel = providers.map((provider) => `${provider.displayName} (${statusLabel(provider.status)})`).join(", ");

  if (!providers.length) {
    return { label: "Ainda não configurada", tone: "text-pending", detail: "Nenhum registro correspondente foi retornado pelo catálogo remoto; a configuração será preparada somente ao salvar esta API." };
  }
  if (!connections.length) {
    return { label: "Não configurada", tone: "text-pending", detail: `${providerLabel}. Nenhuma connection da Plataforma foi retornada; a camada Agência fica para a próxima etapa.` };
  }

  const connectionLabel = connections.map((connection) => `${connection.providerName} · ${statusLabel(connection.lifecycleStatus)}`).join(", ");
  const ready = providers.some((provider) => provider.status === "active") && connections.some((connection) => connection.lifecycleStatus === "ready");
  return { label: ready ? "Configurada" : "Precisa validar", tone: ready ? "text-success" : "text-warning", detail: `${providerLabel}. Connections da Plataforma: ${connectionLabel}.` };
}

function apiStatus(data: PlatformIntegrationsSnapshot, definition: (typeof supportedApiDefinitions)[number]) {
  const provider = data.providers.find((item) => item.providerKey === definition.key);
  const connection = data.platformConnections.find((item) => item.providerKey === definition.key && item.environment === "production");

  if (definition.key === "google_cloud") return googleCloudConnectionStatus(connection);
  if (connection?.lifecycleStatus === "error") {
    const diagnostic = [
      connection.healthCheck.stage ? `Etapa: ${healthStageLabel(connection.healthCheck.stage)}` : null,
      connection.healthCheck.httpStatus ? `HTTP ${connection.healthCheck.httpStatus}` : null,
      connection.healthCheck.googleAdsCode ? `Código: ${connection.healthCheck.googleAdsCode}` : null,
    ].filter(Boolean).join(" · ");
    return { label: "Erro", tone: "text-danger", detail: `${connection.healthCheck.message || "A connection está marcada com erro. Valide o diagnóstico operacional."}${diagnostic ? ` ${diagnostic}.` : ""}` };
  }
  if (definition.key === "google_ads") {
    const staticConfigReady = Object.values(data.googleAdsStaticConfig).every(Boolean);
    if (!connection || !connection.secretConfigured) return { label: "Não configurado", tone: "text-pending", detail: "OAuth Refresh Token: Não configurado no Secret Store." };
    if (!staticConfigReady) return { label: "Precisa validar", tone: "text-warning", detail: "OAuth Refresh Token configurado; a configuração estática server-side ainda está incompleta." };
    if (connection.lifecycleStatus !== "ready") return { label: "Configurado", tone: "text-success", detail: "OAuth Refresh Token configurado no Secret Store; use Testar conexão para validar o OAuth explicitamente." };
    return { label: "Configurado", tone: "text-success", detail: "OAuth Refresh Token configurado. A tela não exibe o segredo e não faz chamadas automáticas." };
  }
  if (connection?.lifecycleStatus === "disabled" || connection?.lifecycleStatus === "revoked" || provider?.status === "disabled") {
    return { label: "Erro", tone: "text-danger", detail: "A configuração ou o provider está desabilitado no catálogo técnico." };
  }
  if (definition.key === "telegram") {
    if (!connection || !connection.secretConfigured) return { label: "Não configurado", tone: "text-pending", detail: "Bot Token: Não configurado. Salve o token para gerar automaticamente o segredo do webhook." };
    const botName = connection.healthCheck.details.botName || connection.healthCheck.details.botUsername;
    const botDetail = botName ? ` Último getMe: ${botName}.` : "";
    return {
      label: "Configurado",
      tone: "text-success",
      detail: `Bot Token: Configurado. Segredo do webhook: Configurado automaticamente. Webhook: ${connection.telegramWebhookConfigured ? "Configurado" : "Não configurado"}.${botDetail} Salvar não chama o Telegram; use Testar Bot para validar explicitamente.`,
    };
  }
  if (!connection) {
    return {
      label: "Não configurado",
      tone: "text-pending",
      detail: definition.key === "deepseek"
        ? `Modelo: DeepSeek V4 Pro (${DEEPSEEK_DEFAULT_MODEL}). Endpoint canônico: ${DEEPSEEK_BASE_URL}. Nenhuma connection global foi encontrada.`
        : "Nenhuma connection global da Plataforma foi encontrada.",
    };
  }
  if (!connection.secretConfigured) {
    return { label: "Não configurado", tone: "text-pending", detail: "A connection existe, mas a credencial ainda não foi salva." };
  }
  if (connection.lifecycleStatus !== "ready") {
    return {
      label: definition.key === "deepseek" ? "Configurado" : "Precisa validar",
      tone: definition.key === "deepseek" ? "text-success" : "text-warning",
      detail: definition.key === "deepseek"
        ? `Credencial configurada com segurança para o modelo ${DEEPSEEK_DEFAULT_MODEL}; a connection aguarda health check explícito.`
        : "Credencial configurada com segurança; a connection aguarda validação operacional explícita.",
    };
  }
  if (definition.key === "deepseek") {
    const model = connection.configuredModel || DEEPSEEK_DEFAULT_MODEL;
    const availability = connection.healthCheck.currentModelAvailable === null ? "Ainda não verificado" : connection.healthCheck.currentModelAvailable ? "Sim" : "Não";
    return { label: "Configurado", tone: "text-success", detail: `Connection READY. Modelo atual: ${model}. Modelo disponível: ${availability}.` };
  }
  return { label: "Configurado", tone: "text-success", detail: "Connection READY. Esta tela não faz chamada automática ao provider." };
}

export default function PlatformIntegrationsPanel() {
  const [data, setData] = useState<PlatformIntegrationsSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [checkingProvider, setCheckingProvider] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  useNoticeBridge({ notice, module: "admin", area: "Integrações", title: "Administração · Integrações", fallbackSeverity: "INFO" });
  const [view, setView] = useState<IntegrationView>("overview");
  const [editingProvider, setEditingProvider] = useState<SupportedProviderKey | null>(null);
  const [apiForm, setApiForm] = useState<ApiFormState>(emptyApiForm);
  const [providerForm, setProviderForm] = useState({ providerKey: "", displayName: "", status: "active" });
  const [capabilityForm, setCapabilityForm] = useState<{ capabilityKey: string; operationKind: typeof capabilityOperations[number]; environment: string; unitName: string; status: string }>({ capabilityKey: "", operationKind: capabilityOperations[0], environment: "production", unitName: "request", status: "active" });
  const [connectionForm, setConnectionForm] = useState({ providerId: "", environment: "production", label: "" });

  const load = async (): Promise<boolean> => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/integrations", { cache: "no-store" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Não foi possível carregar as integrações.");
      const next = body as PlatformIntegrationsSnapshot;
      setData(next);
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível carregar as integrações.");
      return false;
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, []);

  const mutate = async (body: Record<string, unknown>, successMessage: string): Promise<boolean> => {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/admin/integrations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        const databaseCode = typeof result?.diagnostic?.databaseCode === "string" && /^[A-Z0-9_]{3,80}$/.test(result.diagnostic.databaseCode)
          ? result.diagnostic.databaseCode
          : "";
        const databaseConstraint = typeof result?.diagnostic?.databaseConstraint === "string" && /^[A-Za-z0-9_]{1,120}$/.test(result.diagnostic.databaseConstraint)
          ? result.diagnostic.databaseConstraint
          : "";
        const technicalDetail = [databaseCode, databaseConstraint].filter(Boolean).join(" / ");
        throw new Error(`${result.error || "Não foi possível salvar a integração."}${technicalDetail ? ` (diagnóstico técnico: ${technicalDetail})` : ""}`);
      }
      const readbackOk = await load();
      if (!readbackOk) return false;
      setNotice(successMessage);
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível salvar a integração.");
      return false;
    } finally {
      setSaving(false);
    }
  };

  const beginConfiguration = (providerKey: SupportedProviderKey) => {
    const definition = supportedApiDefinitions.find((item) => item.key === providerKey);
    const existingConnection = data?.platformConnections.find((item) => item.providerKey === providerKey && item.environment === "production");
    setView("connections");
    setEditingProvider(providerKey);
    setApiForm({
      ...emptyApiForm,
      label: definition?.name || "",
      googleCloudBucketName: providerKey === "google_cloud" ? existingConnection?.googleCloudBucketName || "" : "",
      telegramWebhookUrl: providerKey === "telegram" ? existingConnection?.telegramWebhookUrl || "" : "",
    });
    setError("");
    setNotice("");
  };

  const updateApiForm = (field: keyof ApiFormState, value: string) => setApiForm((current) => ({ ...current, [field]: value }));

  const configureApi = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editingProvider) return;
    if (editingProvider === "google_ads") {
      const saved = await mutate({
        action: "rotate_google_ads_refresh_token",
        refreshToken: apiForm.googleAdsRefreshToken,
        label: apiForm.label || "Plataforma / infraestrutura",
      }, "OAuth Refresh Token Google Ads atualizado. O token foi salvo no Secret Store; execute Testar conexão separadamente.");
      if (saved) {
        setApiForm(emptyApiForm);
        setEditingProvider(null);
      }
      return;
    }
    const secretPayload = editingProvider === "deepseek"
      ? JSON.stringify({ DEEPSEEK_API_KEY: apiForm.deepseekApiKey })
      : editingProvider === "google_cloud"
        ? apiForm.googleCloudServiceAccount
          : editingProvider === "youtube_data"
            ? JSON.stringify({ YOUTUBE_DATA_API_KEY: apiForm.youtubeDataApiKey })
            : editingProvider === "telegram"
            ? JSON.stringify({ botToken: apiForm.telegramBotToken })
          : JSON.stringify({ DATAFORSEO_LOGIN: apiForm.dataforseoLogin, DATAFORSEO_PASSWORD: apiForm.dataforseoPassword });
    const definition = supportedApiDefinitions.find((item) => item.key === editingProvider);
    const saved = await mutate({
      action: "configure_supported_platform_provider",
      providerKey: editingProvider,
      environment: "production",
      label: apiForm.label || definition?.name,
      secretPayload,
      ...(editingProvider === "google_cloud" ? { bucketName: apiForm.googleCloudBucketName } : {}),
      ...(editingProvider === "youtube_data" && apiForm.youtubeHealthVideoId.trim() ? { youtubeHealthVideoId: apiForm.youtubeHealthVideoId } : {}),
      ...(editingProvider === "telegram" && apiForm.telegramWebhookUrl.trim() ? { telegramWebhookUrl: apiForm.telegramWebhookUrl } : {}),
    }, editingProvider === "telegram"
      ? "Bot Token salvo. O segredo do webhook foi configurado automaticamente; use Testar Bot ou configure o webhook separadamente."
      : `${definition?.name || "API"} configurada. A credencial foi salva com segurança e a connection aguarda validação explícita.`);
    if (saved) {
      setApiForm(emptyApiForm);
      setEditingProvider(null);
    }
  };

  const configureTelegramWebhook = async () => {
    if (editingProvider !== "telegram") return;
    const connection = data?.platformConnections.find((item) => item.providerKey === "telegram" && item.environment === "production");
    if (!connection) return;
    await mutate({ action: "configure_telegram_webhook", connectionId: connection.id, url: apiForm.telegramWebhookUrl.trim() }, "Webhook Telegram configurado explicitamente. O endpoint agora pode receber o smoke manual.");
  };

  const testConnection = async (definition: (typeof supportedApiDefinitions)[number], healthOperation?: "speech" | "storage" | "youtube" | "telegram_get_me" | "telegram_webhook") => {
    const connection = data?.platformConnections.find((item) => item.providerKey === definition.key && item.environment === "production");
    if (!connection?.secretConfigured || saving || checkingProvider) return;
    const checkKey = `${definition.key}:${healthOperation || "default"}`;
    setCheckingProvider(checkKey);
    const successMessage = healthOperation === "storage"
      ? "Cloud Storage validado. O status do bucket foi atualizado separadamente da Connection."
      : healthOperation === "speech"
        ? "Speech-to-Text validado. A Connection Google Cloud foi atualizada."
        : `${definition.name}${healthOperation === "telegram_webhook" ? " webhook" : ""} validada. A Connection está READY.`;
    const saved = await mutate({ action: "health_check_platform_connection", connectionId: connection.id, providerKey: definition.key, ...(healthOperation ? { healthOperation } : {}) }, successMessage);
    if (!saved) await load();
    setCheckingProvider(null);
  };

  const isChecking = (definition: (typeof supportedApiDefinitions)[number], healthOperation?: "speech" | "storage" | "youtube" | "telegram_get_me" | "telegram_webhook") => checkingProvider === `${definition.key}:${healthOperation || "default"}`;

  const createProvider = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const saved = await mutate({ action: "create_provider", ...providerForm }, "Provider cadastrado no catálogo.");
    if (saved) setProviderForm({ providerKey: "", displayName: "", status: "active" });
  };

  const createCapability = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const saved = await mutate({ action: "create_capability", ...capabilityForm }, "Capability cadastrada no catálogo.");
    if (saved) setCapabilityForm({ capabilityKey: "", operationKind: capabilityOperations[0], environment: "production", unitName: "request", status: "active" });
  };

  const createConnection = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const saved = await mutate({ action: "create_platform_connection", ...connectionForm }, "Connection da Plataforma criada em DRAFT, sem segredo.");
    if (saved) setConnectionForm({ providerId: "", environment: "production", label: "" });
  };

  const applyHomologationPolicy = async () => {
    await mutate({ action: "apply_platform_homologation_policy" }, "Política de homologação aplicada com grants, bindings e quota ilimitada confirmados pelo servidor.");
  };

  const bootstrapCapabilityCatalog = async () => {
    await mutate({ action: "bootstrap_platform_capability_catalog" }, "Catálogo canônico confirmado. Nenhuma Connection, credencial ou capability existente foi alterada.");
  };

  const toggleProvider = (provider: PlatformIntegrationsSnapshot["providers"][number]) => void mutate({ action: "update_provider", id: provider.id, status: provider.status === "active" ? "disabled" : "active" }, "Status do provider atualizado.");
  const toggleCapability = (capability: PlatformIntegrationsSnapshot["capabilities"][number]) => void mutate({ action: "update_capability", id: capability.id, status: capability.status === "active" ? "disabled" : "active" }, "Status da capability atualizado.");

  return <div className="min-w-0 space-y-6 bg-background p-4 text-foreground sm:p-6">
    <header className="border-b border-foreground/15 pb-5">
      <p className="max-w-3xl text-sm leading-6 text-foreground/70">Confira quais APIs da Plataforma estão configuradas e prepare suas credenciais sem expor segredos. Nenhum provider é chamado automaticamente ao abrir esta tela.</p>
    </header>

    {error ? <p role="alert" className="rounded-md border border-foreground/20 bg-foreground/5 p-3 text-sm">{error}</p> : null}
    {notice ? <p role="status" className="rounded-md border border-foreground/20 bg-foreground/5 p-3 text-sm">{notice}</p> : null}
    {loading && !data ? <p className="flex items-center gap-2 text-sm text-foreground/70"><Loader2 className="h-4 w-4 animate-spin" />Carregando dados reais de Integrações…</p> : null}

    {data ? <>
      <nav className="flex gap-1 overflow-x-auto border-b border-divider pb-1" aria-label="Visões de integrações" role="tablist">
        {integrationViews.map((item) => <button key={item.id} type="button" role="tab" aria-selected={view === item.id} className={`whitespace-nowrap rounded-md px-3 py-2 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-context-accent ${view === item.id ? "bg-selected text-foreground" : "text-text-muted hover:bg-surface-subtle hover:text-foreground"}`} onClick={() => setView(item.id)}>{item.label}</button>)}
      </nav>

      {view === "overview" ? <>
        <section className={panel} aria-labelledby="platform-apis-title">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 id="platform-apis-title" className="text-lg font-semibold">APIs da Plataforma</h2>
              <p className="mt-1 max-w-3xl text-sm text-foreground/70">A configuração abaixo é específica para cada provider. O status mostra o estado persistido da connection; “Precisa validar” não é tratado como provider funcionando.</p>
            </div>
            <span className="text-sm text-foreground/60">Origem explícita · sem fallback</span>
          </div>
          <div className="mt-4 divide-y divide-foreground/10">
            {supportedApiDefinitions.map((definition) => {
              const state = apiStatus(data, definition);
              const connection = data.platformConnections.find((item) => item.providerKey === definition.key && item.environment === "production");
              const canTest = Boolean(connection?.secretConfigured) && !saving && !checkingProvider;
              const renderHealthButton = (label: string, healthOperation?: "speech" | "storage" | "youtube") => <button type="button" className={secondary} disabled={!canTest} onClick={() => void testConnection(definition, healthOperation)} title={!connection ? "Configure a Connection antes de testar." : !connection.secretConfigured ? "Salve a credencial antes de testar." : undefined}>{isChecking(definition, healthOperation) ? <Loader2 className="h-4 w-4 animate-spin" /> : null}{isChecking(definition, healthOperation) ? "Validando…" : label}</button>;
              return <div key={definition.key} className="grid gap-3 py-4 lg:grid-cols-[minmax(8rem,0.7fr)_minmax(0,1.25fr)_minmax(0,1.3fr)_auto] lg:items-center">
                <div>
                  <p className="text-sm font-semibold">{definition.name}</p>
                  <p className="mt-1 text-sm text-foreground/65">{definition.group} · {definition.origin}</p>
                </div>
                <p className="text-sm text-foreground/70">{definition.description}</p>
                <div>
                  <p className={`text-sm font-semibold ${state.tone}`}>{state.label}</p>
                  <p className="mt-1 text-sm text-foreground/65">{state.detail}</p>
                  {definition.key === "google_cloud" ? (() => {
                    const bucketName = connection?.googleCloudBucketName || null;
                    const speech = googleCloudHealthStatus(connection?.googleCloudHealth?.speech || null, bucketName, "speech");
                    const storage = googleCloudHealthStatus(connection?.googleCloudHealth?.storage || null, bucketName, "storage");
                    return <div className="mt-3 grid gap-2 border-t border-foreground/10 pt-3 text-sm sm:grid-cols-3" aria-label="Status separado do Google Cloud">
                      <p><span className="text-foreground/60">Connection:</span> <strong className={state.tone}>{state.label}</strong></p>
                      <p><span className="text-foreground/60">Speech:</span> <strong className={speech.tone}>{speech.label}</strong><span className="mt-1 block text-xs text-foreground/60">{speech.detail}</span></p>
                      <p><span className="text-foreground/60">Cloud Storage:</span> <strong className={storage.tone}>{storage.label}</strong><span className="mt-1 block text-xs text-foreground/60">{storage.detail}</span></p>
                    </div>;
                  })() : null}
                </div>
                <div className="flex flex-wrap gap-2 lg:justify-end">
                   <button type="button" className={primary} disabled={saving} onClick={() => beginConfiguration(definition.key)}>{definition.key === "google_ads" ? connection?.secretConfigured ? "Substituir token" : "Configurar token" : connection?.secretConfigured ? "Substituir credencial" : "Configurar"}</button>
                  {definition.key === "google_cloud" ? <>{renderHealthButton("Testar Speech", "speech")}{renderHealthButton("Testar Storage", "storage")}</> : definition.key === "telegram" ? <><button type="button" className={secondary} disabled={!canTest} onClick={() => void testConnection(definition, "telegram_get_me")} title={!connection ? "Configure uma Connection antes de testar." : !connection.secretConfigured ? "Salve a credencial antes de testar." : undefined}>{isChecking(definition, "telegram_get_me") ? "Validando…" : "Testar Bot"}</button><button type="button" className={secondary} disabled={!canTest} onClick={() => void testConnection(definition, "telegram_webhook")} title={!connection ? "Configure uma Connection antes de testar." : !connection.secretConfigured ? "Salve a credencial antes de testar." : undefined}>{isChecking(definition, "telegram_webhook") ? "Validando…" : "Testar Webhook"}</button></> : renderHealthButton(definition.key === "youtube_data" ? "Testar YouTube" : "Testar conexão", definition.key === "youtube_data" ? "youtube" : undefined)}
                </div>
              </div>;
            })}
          </div>
        </section>

        <section className={panel} aria-labelledby="secure-flow-title">
          <h2 id="secure-flow-title" className="text-lg font-semibold">Como a configuração funciona</h2>
          <div className="mt-3 grid gap-3 text-sm text-foreground/70 md:grid-cols-3">
            <p><strong className="text-foreground">1. Escolha a API.</strong><br />A Plataforma usa somente providers suportados e com origem explícita.</p>
            <p><strong className="text-foreground">2. Salve a credencial.</strong><br />O servidor grava no secret store/Vault existente e a tela recebe apenas um status booleano.</p>
            <p><strong className="text-foreground">3. Teste explicitamente.</strong><br />Depois de salvar, use “Testar conexão”. Nenhuma chamada paga ou teste de provider é disparado no carregamento ou no salvamento.</p>
          </div>
        </section>

        <section className={panel} aria-labelledby="source-contracts-title">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 id="source-contracts-title" className="text-lg font-semibold">Origem canônica dos recursos</h2><p className="mt-1 text-sm text-foreground/70">Governança e distribuição continuam separadas da configuração operacional da API.</p></div><span className="text-sm text-foreground/60">Sem fallback</span></div>
          <div className="mt-4 divide-y divide-foreground/10">{sourceContracts.map((contract) => { const evidence = sourceEvidence(data, contract.providerKeys); return <div key={contract.name} className="grid gap-2 py-3 lg:grid-cols-[minmax(9rem,0.7fr)_minmax(11rem,0.8fr)_minmax(0,1.5fr)_auto] lg:items-start"><div><p className="text-sm font-semibold">{contract.name}</p><p className="mt-1 text-sm text-foreground/65">{contract.source}</p></div><p className="text-sm text-foreground/70">{contract.contract}</p><p className="text-sm text-foreground/65">{evidence.detail}</p><p className={`text-sm font-semibold ${evidence.tone}`}>{evidence.label}</p></div>; })}</div>
        </section>
      </> : null}

      {view === "connections" ? <>
        <section className={panel} aria-labelledby="api-config-title">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div><h2 id="api-config-title" className="text-lg font-semibold">Configurações das APIs</h2><p className="mt-1 text-sm text-foreground/70">As credenciais são aceitas somente nesta ação explícita, enviadas ao servidor e nunca retornadas para o navegador.</p></div>
            <KeyRound className="h-5 w-5 text-context-accent" aria-hidden="true" />
          </div>
             {!editingProvider ? <div className="mt-4 grid gap-3 md:grid-cols-2">{supportedApiDefinitions.map((definition) => <button key={definition.key} type="button" className="flex min-h-16 items-center justify-between gap-3 rounded-md border border-foreground/15 px-4 text-left hover:bg-foreground/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-context-accent" onClick={() => beginConfiguration(definition.key)}><span><span className="block text-sm font-semibold">{definition.name}</span><span className="mt-1 block text-sm text-foreground/65">{definition.origin}</span></span><span className="text-sm font-semibold text-context-accent">{definition.key === "google_ads" ? data.platformConnections.find((item) => item.providerKey === "google_ads")?.secretConfigured ? "Substituir token" : "Configurar token" : "Configurar"}</span></button>)}</div> : <>
             {editingProvider === "google_ads" ? <form className="mt-5 space-y-5 border-t border-foreground/15 pt-5" onSubmit={configureApi}>
               <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-sm font-semibold">Google Ads</p><p className="mt-1 text-sm text-foreground/65">Origem: Plataforma / infraestrutura · o refresh token é a única credencial rotacionável nesta tela.</p></div><button type="button" className={secondary} disabled={saving} onClick={() => { setEditingProvider(null); setApiForm(emptyApiForm); }}>Cancelar</button></div>
               <div className="rounded-md border border-foreground/15 bg-foreground/5 p-4 text-sm"><p className="font-semibold">Configuração estática — somente leitura</p><div className="mt-3 grid gap-2 sm:grid-cols-2"><p>Developer Token: <strong>{data.googleAdsStaticConfig.developerTokenConfigured ? "Configurado" : "Não configurado"}</strong></p><p>Client ID: <strong>{data.googleAdsStaticConfig.clientIdConfigured ? "Configurado" : "Não configurado"}</strong></p><p>Client Secret: <strong>{data.googleAdsStaticConfig.clientSecretConfigured ? "Configurado" : "Não configurado"}</strong></p><p>Login Customer ID: <strong>{data.googleAdsStaticConfig.loginCustomerIdConfigured ? "Configurado" : "Não configurado"}</strong></p><p>Research Customer ID: <strong>{data.googleAdsStaticConfig.researchCustomerIdConfigured ? "Configurado" : "Não configurado"}</strong></p><p>API version: <strong>{data.googleAdsStaticConfig.apiVersionConfigured ? "Configurado" : "Não configurado"}</strong></p></div><p className="mt-3 text-foreground/70">Esses valores continuam em ENV/Vercel server-side. A interface não lê nem altera seus conteúdos.</p></div>
               <div className="rounded-md border border-foreground/15 p-4"><div className="flex flex-wrap items-center justify-between gap-2"><p className="font-semibold">OAuth Refresh Token</p><span className="text-sm font-semibold text-foreground/70">Estado: {data.platformConnections.find((item) => item.providerKey === "google_ads" && item.environment === "production")?.secretConfigured ? "Configurado" : "Não configurado"}</span></div><label className="mt-4 block text-sm">Novo refresh token<input className={input} type="password" autoComplete="new-password" value={apiForm.googleAdsRefreshToken} onChange={(event) => updateApiForm("googleAdsRefreshToken", event.target.value)} required aria-describedby="google-ads-refresh-token-help" /><span id="google-ads-refresh-token-help" className="mt-1 block text-sm leading-5 text-foreground/65">Usado somente para substituir o segredo salvo. O valor atual nunca é exibido.</span></label><p className="mt-3 text-sm leading-5 text-foreground/65">Atualizar o token não executa health check. Depois do salvamento, use “Testar conexão” para validar o OAuth explicitamente.</p></div>
               <div className="flex flex-wrap items-center justify-end gap-2"><button type="button" className={secondary} disabled={saving} onClick={() => { setEditingProvider(null); setApiForm(emptyApiForm); }}>Cancelar</button><button type="submit" className={primary} disabled={saving}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}Atualizar token</button></div>
             </form> : editingProvider === "deepseek" ? <form className="mt-5 space-y-5 border-t border-foreground/15 pt-5" onSubmit={configureApi}>
              <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-sm font-semibold">DeepSeek oficial</p><p className="mt-1 text-sm text-foreground/65">Origem: Plataforma · provider único da IA nesta fase, sem fallback.</p></div><button type="button" className={secondary} disabled={saving} onClick={() => { setEditingProvider(null); setApiForm(emptyApiForm); }}>Cancelar</button></div>
              <label className="block text-sm">API Key<input className={input} type="password" autoComplete="new-password" value={apiForm.deepseekApiKey} onChange={(event) => updateApiForm("deepseekApiKey", event.target.value)} required aria-describedby="deepseek-key-help" /><span id="deepseek-key-help" className="mt-1 block text-sm leading-5 text-foreground/65">Obrigatória para salvar. O valor segue somente para o servidor e não é reexibido.</span></label>
              <div className="grid gap-4 md:grid-cols-2"><label className="text-sm">Modelo<input className={input} value={DEEPSEEK_DEFAULT_MODEL} readOnly aria-readonly="true" /><span className="mt-1 block text-sm leading-5 text-foreground/65">DeepSeek V4 Pro · ID técnico fixo nesta fase.</span></label><label className="text-sm">Endpoint<input className={input} value={DEEPSEEK_BASE_URL} readOnly aria-readonly="true" /></label></div>
              <p className="rounded-md border border-foreground/15 bg-foreground/5 p-3 text-sm leading-5 text-foreground/70">Salvar configura a Connection global e grava a credencial no Secret Store/Vault. O salvamento não executa health check; use “Testar conexão” somente depois, quando quiser validar explicitamente.</p>
              <div className="flex flex-wrap items-center justify-end gap-2"><button type="submit" className={primary} disabled={saving}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}Salvar configuração</button></div>
            </form> : editingProvider === "google_cloud" ? <form className="mt-5 space-y-5 border-t border-foreground/15 pt-5" onSubmit={configureApi}>
              <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-sm font-semibold">Google Cloud Media</p><p className="mt-1 text-sm text-foreground/65">Origem: Plataforma · uma Service Account global serve Speech-to-Text e Cloud Storage.</p></div><button type="button" className={secondary} disabled={saving} onClick={() => { setEditingProvider(null); setApiForm(emptyApiForm); }}>Cancelar</button></div>
              <label className="block text-sm">JSON da Service Account<textarea className={`${input} min-h-44 py-2 font-mono text-xs`} value={apiForm.googleCloudServiceAccount} onChange={(event) => updateApiForm("googleCloudServiceAccount", event.target.value)} required aria-describedby="google-cloud-credential-help" /><span id="google-cloud-credential-help" className="mt-1 block text-sm leading-5 text-foreground/65">Cole o JSON recebido do Google Cloud. O conteúdo segue somente para o servidor, é normalizado e nunca retorna para o navegador.</span></label>
              <label className="block text-sm">Bucket de mídia<input className={input} value={apiForm.googleCloudBucketName} onChange={(event) => updateApiForm("googleCloudBucketName", event.target.value)} placeholder="google-cloud-media-bucket" required aria-describedby="google-cloud-bucket-help" /><span id="google-cloud-bucket-help" className="mt-1 block text-sm leading-5 text-foreground/65">Informe somente o nome do bucket, sem gs://, URL HTTPS ou caminho de objeto. O bucket deve existir e ser configurado manualmente; a aplicação não cria bucket.</span></label>
              <p className="rounded-md border border-foreground/15 bg-foreground/5 p-3 text-sm leading-5 text-foreground/70">Salvar deixa a Connection PENDING. Use Testar Speech e Testar Storage separadamente para confirmar o acesso; nenhum health check é executado no salvamento ou ao abrir o Admin.</p>
              <div className="flex flex-wrap items-center justify-end gap-2"><button type="submit" className={primary} disabled={saving}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}Salvar configuração</button></div>
            </form> : editingProvider === "youtube_data" ? <form className="mt-5 space-y-5 border-t border-foreground/15 pt-5" onSubmit={configureApi}>
              <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-sm font-semibold">YouTube Data API</p><p className="mt-1 text-sm text-foreground/65">Origem: Plataforma · leitura de metadados públicos via REST server-side.</p></div><button type="button" className={secondary} disabled={saving} onClick={() => { setEditingProvider(null); setApiForm(emptyApiForm); }}>Cancelar</button></div>
              <label className="block text-sm">API key restrita<input className={input} type="password" autoComplete="new-password" value={apiForm.youtubeDataApiKey} onChange={(event) => updateApiForm("youtubeDataApiKey", event.target.value)} required aria-describedby="youtube-data-key-help" /><span id="youtube-data-key-help" className="mt-1 block text-sm leading-5 text-foreground/65">Use uma chave restrita ao YouTube Data API. O valor salvo nunca é exibido.</span></label>
              <label className="block text-sm">videoId de fixture para health check<input className={input} value={apiForm.youtubeHealthVideoId} onChange={(event) => updateApiForm("youtubeHealthVideoId", event.target.value)} placeholder="opcional até o teste explícito" aria-describedby="youtube-health-help" /><span id="youtube-health-help" className="mt-1 block text-sm leading-5 text-foreground/65">A consulta de teste usa somente metadados; não baixa nem transcreve o vídeo.</span></label>
              <p className="rounded-md border border-foreground/15 bg-foreground/5 p-3 text-sm leading-5 text-foreground/70">Salvar deixa a Connection PENDING. A API YouTube Data v3 precisa ser habilitada manualmente no projeto Google Cloud.</p>
              <div className="flex flex-wrap items-center justify-end gap-2"><button type="submit" className={primary} disabled={saving}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}Salvar configuração</button></div>
            </form> : (() => { const definition = supportedApiDefinitions.find((item) => item.key === editingProvider); if (!definition) return null; return <form className="mt-5 space-y-5 border-t border-foreground/15 pt-5" onSubmit={configureApi}>
              <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-sm font-semibold">{definition.name}</p><p className="mt-1 text-sm text-foreground/65">Origem: {definition.origin} · ambiente: production · connection global da Plataforma</p></div><button type="button" className={secondary} disabled={saving} onClick={() => { setEditingProvider(null); setApiForm(emptyApiForm); }}>Cancelar</button></div>
              <label className="block text-sm">Nome da configuração<input className={input} value={apiForm.label} onChange={(event) => updateApiForm("label", event.target.value)} maxLength={160} /></label>
               {editingProvider === "dataforseo" ? <div className="grid gap-4 md:grid-cols-2"><label className="text-sm"><span>Login</span><input className={input} type="password" autoComplete="new-password" value={apiForm.dataforseoLogin} onChange={(event) => updateApiForm("dataforseoLogin", event.target.value)} required /><span className="mt-1 block text-sm leading-5 text-foreground/65">Variável atual: DATAFORSEO_LOGIN</span></label><label className="text-sm"><span>Password</span><input className={input} type="password" autoComplete="new-password" value={apiForm.dataforseoPassword} onChange={(event) => updateApiForm("dataforseoPassword", event.target.value)} required /><span className="mt-1 block text-sm leading-5 text-foreground/65">Variável atual: DATAFORSEO_PASSWORD</span></label></div> : editingProvider === "telegram" ? <div className="grid gap-4 md:grid-cols-2"><label className="text-sm"><span>Bot token</span><input className={input} type="password" autoComplete="new-password" value={apiForm.telegramBotToken} onChange={(event) => updateApiForm("telegramBotToken", event.target.value)} required /><span className="mt-1 block text-sm leading-5 text-foreground/65">O token fica somente no Secret Store.</span></label><div className="rounded-md border border-foreground/15 bg-foreground/5 p-3"><p className="text-sm font-semibold">Segredo do webhook</p><p className="mt-1 text-sm text-foreground/75">Configurado automaticamente</p><p className="mt-1 text-sm leading-5 text-foreground/65">O servidor gera ou preserva o segredo no Secret Store. O valor nunca é exibido nesta tela.</p></div><label className="text-sm md:col-span-2"><span>URL pública do webhook (opcional nesta etapa)</span><input className={input} type="url" value={apiForm.telegramWebhookUrl} onChange={(event) => updateApiForm("telegramWebhookUrl", event.target.value)} placeholder="https://seu-dominio/api/integrations/telegram/webhook" /><span className="mt-1 block text-sm leading-5 text-foreground/65">Salvar não chama getMe, getWebhookInfo nem setWebhook. Use Configurar Webhook somente depois, com uma URL pública HTTPS.</span></label></div> : null}
               <div className="flex flex-wrap items-center justify-between gap-3"><p className="max-w-2xl text-sm text-foreground/60">Secrets existentes não são lidos de volta. Com uma Connection já configurada, salvar apenas a credencial atualiza o Secret Store/Vault e mantém uma única Connection.</p><div className="flex flex-wrap gap-2">{editingProvider === "telegram" && apiForm.telegramWebhookUrl.trim() ? <button type="button" className={secondary} disabled={saving} onClick={() => void configureTelegramWebhook()}>Configurar Webhook</button> : null}<button type="submit" className={primary} disabled={saving}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}Salvar configuração</button></div></div>
            </form>; })()}
          </>}
        </section>

        <details className={panel}>
          <summary className="cursor-pointer text-lg font-semibold">Catálogo técnico (avançado)</summary>
          <div className="mt-5 space-y-6">
            <section aria-labelledby="providers-title">
              <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 id="providers-title" className="text-lg font-semibold">Providers</h2><p className="mt-1 text-sm text-foreground/70">Quem fornece tecnicamente o recurso. O fluxo principal não exige cadastro manual desses registros.</p></div><span className="text-sm text-foreground/60">Catálogo real</span></div>
              {data.providers.length ? <div className="mt-4 divide-y divide-foreground/10">{data.providers.map((provider) => <div key={provider.id} className="flex flex-wrap items-center justify-between gap-3 py-3"><div><p className="text-sm font-semibold">{provider.displayName}</p><p className="mt-1 text-sm text-foreground/65">{provider.providerKey} · {statusLabel(provider.status)}</p></div><button type="button" className={secondary} disabled={saving || provider.status === "legacy"} onClick={() => toggleProvider(provider)}>{provider.status === "active" ? <ToggleLeft className="h-4 w-4" /> : <ToggleRight className="h-4 w-4" />} {provider.status === "active" ? "Desabilitar" : "Ativar"}</button></div>)}</div> : emptyState("Nenhum provider cadastrado.")}
              <form className="mt-5 grid gap-3 border-t border-foreground/15 pt-5 sm:grid-cols-2" onSubmit={createProvider}>
                <label className="text-sm">Chave canônica<input className={input} value={providerForm.providerKey} onChange={(event) => setProviderForm({ ...providerForm, providerKey: event.target.value })} placeholder="exemplo_provider" required /></label>
                <label className="text-sm">Nome exibido<input className={input} value={providerForm.displayName} onChange={(event) => setProviderForm({ ...providerForm, displayName: event.target.value })} required /></label>
                <label className="text-sm">Status<select className={input} value={providerForm.status} onChange={(event) => setProviderForm({ ...providerForm, status: event.target.value })}><option value="active">Active</option><option value="disabled">Disabled</option><option value="legacy">Legacy</option></select></label>
                <div className="flex items-end"><button className={primary} disabled={saving}><Plus className="h-4 w-4" />Cadastrar provider</button></div>
              </form>
              <p className="mt-3 text-sm text-foreground/60">Providers legados fora do contrato não podem ser cadastrados aqui.</p>
            </section>

            <section aria-labelledby="capabilities-title">
              <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 id="capabilities-title" className="text-lg font-semibold">Capabilities</h2><p className="mt-1 text-sm text-foreground/70">O que o produto permite fazer, independentemente do provider. A capability não é uma credencial.</p></div><span className="text-sm text-foreground/60">Catálogo real</span></div>
              {data.capabilities.length ? <div className="mt-4 divide-y divide-foreground/10">{data.capabilities.map((capability) => <div key={capability.id} className="flex flex-wrap items-center justify-between gap-3 py-3"><div><p className="text-sm font-semibold">{capability.capabilityKey}</p><p className="mt-1 text-sm text-foreground/65">{capability.operationKind} · {capability.environment} · unidade: {capability.unitName} · {statusLabel(capability.status)}</p></div><button type="button" className={secondary} disabled={saving || capability.status === "legacy"} onClick={() => toggleCapability(capability)}>{capability.status === "active" ? <ToggleLeft className="h-4 w-4" /> : <ToggleRight className="h-4 w-4" />} {capability.status === "active" ? "Desabilitar" : "Ativar"}</button></div>)}</div> : emptyState("Nenhuma capability cadastrada.")}
              <form className="mt-5 grid gap-3 border-t border-foreground/15 pt-5 sm:grid-cols-2" onSubmit={createCapability}>
                <label className="text-sm">Chave canônica<input className={input} value={capabilityForm.capabilityKey} onChange={(event) => setCapabilityForm({ ...capabilityForm, capabilityKey: event.target.value })} placeholder="organic_search" required /></label>
                <label className="text-sm">Operação<select className={input} value={capabilityForm.operationKind} onChange={(event) => setCapabilityForm({ ...capabilityForm, operationKind: event.target.value as typeof capabilityOperations[number] })}>{capabilityOperations.map((operation) => <option key={operation} value={operation}>{operation}</option>)}</select></label>
                <label className="text-sm">Ambiente<select className={input} value={capabilityForm.environment} onChange={(event) => setCapabilityForm({ ...capabilityForm, environment: event.target.value })}>{environments.map((environment) => <option key={environment} value={environment}>{environment}</option>)}</select></label>
                <label className="text-sm">Unidade<input className={input} value={capabilityForm.unitName} onChange={(event) => setCapabilityForm({ ...capabilityForm, unitName: event.target.value })} required /></label>
                <div className="sm:col-span-2"><button className={primary} disabled={saving}><Plus className="h-4 w-4" />Cadastrar capability</button></div>
              </form>
            </section>

            <section aria-labelledby="connections-title">
              <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 id="connections-title" className="text-lg font-semibold">Connections técnicas da Plataforma</h2><p className="mt-1 text-sm text-foreground/70">Visão de governança persistida. Configurações concretas devem usar os formulários de API acima.</p></div><Database className="h-5 w-5 text-context-accent" aria-hidden="true" /></div>
              {data.platformConnections.length ? <div className="mt-4 divide-y divide-foreground/10">{data.platformConnections.map((connection) => <div key={connection.id} className="grid gap-2 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"><div><p className="text-sm font-semibold">{connection.label || connection.providerName}</p><p className="mt-1 text-sm text-foreground/65">{connection.providerName} · {connection.environment} · {statusLabel(connection.lifecycleStatus)}</p>{connection.providerKey === "telegram" ? <p className="mt-1 text-sm text-foreground/60">Webhook: {connection.telegramWebhookConfigured ? "Configurado" : "Não configurado"}</p> : null}</div><p className="text-sm text-foreground/70">Credencial: {connection.secretConfigured ? "Configurada" : "Não configurada"}</p></div>)}</div> : emptyState("Nenhuma connection da Plataforma configurada.")}
              <form className="mt-5 grid gap-3 border-t border-foreground/15 pt-5 sm:grid-cols-3" onSubmit={createConnection}>
                <label className="text-sm">Provider<select className={input} value={connectionForm.providerId} onChange={(event) => setConnectionForm({ ...connectionForm, providerId: event.target.value })} required><option value="">Selecione um provider</option>{data.providers.filter((provider) => provider.status !== "legacy" && provider.providerKey !== "deepseek").map((provider) => <option key={provider.id} value={provider.id}>{provider.displayName}</option>)}</select></label>
                <label className="text-sm">Ambiente<select className={input} value={connectionForm.environment} onChange={(event) => setConnectionForm({ ...connectionForm, environment: event.target.value })}>{environments.map((environment) => <option key={environment} value={environment}>{environment}</option>)}</select></label>
                <label className="text-sm">Nome/identificador<input className={input} value={connectionForm.label} onChange={(event) => setConnectionForm({ ...connectionForm, label: event.target.value })} required /></label>
                <div className="sm:col-span-3"><button className={primary} disabled={saving || !data.providers.some((provider) => provider.status !== "legacy" && provider.providerKey !== "deepseek")}><Database className="h-4 w-4" />Criar connection em DRAFT</button></div>
              </form>
              <p className="mt-3 text-sm text-foreground/60">Este caminho técnico cria apenas uma connection DRAFT, sem segredo. DeepSeek é configurada pelo fluxo operacional acima para preservar a Connection canônica e o Secret Store/Vault existente.</p>
            </section>
          </div>
        </details>
      </> : null}

      {view === "agencies" ? <section className="grid gap-6 xl:grid-cols-2">
        <section className={`${panel} xl:col-span-2`} aria-labelledby="homologation-policy-title">
          <div className="flex flex-wrap items-start justify-between gap-4"><div><h2 id="homologation-policy-title" className="text-lg font-semibold">Política de distribuição</h2><p className="mt-1 max-w-3xl text-sm leading-6 text-foreground/70">Homologação: recursos da Plataforma disponíveis para todas as Agências ativas.</p><p className="mt-2 text-sm text-foreground/60">O runtime valida ator, Agency, Brand autorizada e Connection global READY. Capabilities identificam operações para uso e auditoria; não são grants nem permissões de módulo. Google Ads continua exigindo Customer ID externo da Brand quando a operação depende de conta.</p></div><div className="flex shrink-0 flex-col items-start gap-2"><span className="rounded-md border border-foreground/20 px-2.5 py-1 text-sm font-semibold">{data.platformAccessPolicy}</span><div className="flex flex-wrap gap-2"><button type="button" className={secondary} onClick={() => void bootstrapCapabilityCatalog()} disabled={saving}>{saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Database className="h-4 w-4" aria-hidden="true" />}Bootstrap catálogo canônico</button><button type="button" className={primary} onClick={() => void applyHomologationPolicy()} disabled={saving || !data.capabilities.length}>{saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <ShieldCheck className="h-4 w-4" aria-hidden="true" />}Aplicar homologação</button></div></div></div>
          <div className="mt-5 grid gap-3 md:grid-cols-3" aria-label="Disponibilidade dos resources da Plataforma">{supportedApiDefinitions.map((definition) => { const connection = data.platformConnections.find((item) => item.providerKey === definition.key && item.environment === "production"); const available = connection?.lifecycleStatus === "ready" && connection.secretConfigured; return <div key={definition.key} className="rounded-md border border-foreground/15 p-3"><div className="flex items-start justify-between gap-3"><p className="text-sm font-semibold">{definition.name}</p><span className={`text-sm font-semibold ${available ? "text-success" : "text-warning"}`}>{available ? "Disponível" : "Aguardando"}</span></div><p className="mt-1 text-sm text-foreground/65">{connection ? `Connection ${statusLabel(connection.lifecycleStatus)} · ${connection.secretConfigured ? "credencial configurada" : "credencial pendente"}` : "Nenhuma Connection global encontrada."}</p></div>; })}</div>
          {!data.capabilities.length ? <p className="mt-4 rounded-md border border-dashed border-foreground/20 p-3 text-sm text-foreground/70">O catálogo técnico está vazio. Use o bootstrap canônico somente para registrar as operações de uso; ele não distribui acesso.</p> : null}
        </section>
        <section className={panel} aria-labelledby="grants-title"><div className="flex items-start justify-between gap-3"><div><h2 id="grants-title" className="text-lg font-semibold">Distribuição por Agência</h2><p className="mt-1 text-sm text-foreground/70">Concessões legadas ou exceções: mantidas como auditoria, não como gate do runtime de homologação.</p></div><ShieldCheck className="h-5 w-5 text-context-accent" aria-hidden="true" /></div>{data.grants.length ? <div className="mt-4 divide-y divide-foreground/10">{data.grants.map((grant) => <div key={grant.id} className="py-3 text-sm"><p className="font-semibold">{grant.targetName} <span className="font-normal text-foreground/65">({grant.targetScope})</span></p><p className="mt-1 text-foreground/70">{grant.capabilityKey} · origem: {grant.sourceScope}{grant.sourceAgencyName ? ` · ${grant.sourceAgencyName}` : ""} · {grant.environment}</p><p className="mt-1 text-foreground/60">Status: {statusLabel(grant.lifecycleStatus)} · início: {formatDate(grant.startsAt)} · fim: {formatDate(grant.endsAt)}</p></div>)}</div> : emptyState("Nenhuma concessão de acesso registrada.")}</section>
        <section className={panel} aria-labelledby="quota-title"><div><h2 id="quota-title" className="text-lg font-semibold">Limites de consumo</h2><p className="mt-1 text-sm text-foreground/70">Nesta fase, a política de homologação não bloqueia por quota. Registros existentes continuam visíveis para auditoria.</p></div>{data.quotas.length ? <div className="mt-4 divide-y divide-foreground/10">{data.quotas.map((quota) => <div key={quota.id} className="py-3 text-sm"><p className="font-semibold">{quota.capabilityKey} · {quota.scopeName}</p><p className="mt-1 text-foreground/70">{quota.environment} · janela: {quota.windowKind} · limite: {quota.limitUnits === null ? "Ilimitado" : quota.limitUnits}</p><p className="mt-1 text-foreground/60">Status: {statusLabel(quota.status)}</p></div>)}</div> : emptyState("Nenhum limite de consumo cadastrado; a homologação usa disponibilidade ilimitada no runtime.")}</section>
      </section> : null}

      {view === "usage" ? <section className={panel} aria-labelledby="usage-title"><div><h2 id="usage-title" className="text-lg font-semibold">Consumo real</h2><p className="mt-1 text-sm text-foreground/70">Ledger append-only registrado pelo runtime. Nenhum gráfico ou consumo é fabricado.</p></div>{data.usageEvents.length ? <div className="mt-4 divide-y divide-foreground/10">{data.usageEvents.map((event, index) => <div key={`${event.occurredAt}-${index}`} className="grid gap-1 py-3 text-sm md:grid-cols-2"><p className="font-semibold">{event.capabilityKey} · {event.providerName}</p><p className="text-foreground/70">{event.units} {event.unitName} · {statusLabel(event.resultStatus)} · {event.environment}</p><p className="text-foreground/65">Agência: {event.agencyName || "Não vinculada"} · Marca: {event.brandName || "Não vinculada"}</p><p className="text-foreground/65">Operação: {event.operationKind} · {formatDate(event.occurredAt)}</p></div>)}</div> : emptyState("Nenhum consumo registrado.")}</section> : null}
    </> : null}
  </div>;
}
