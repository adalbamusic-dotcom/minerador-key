import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { buildAdminPath, isAdminTab } from "../lib/admin-routing.ts";

const root = new URL("../", import.meta.url);
const read = (path: string) => readFile(new URL(path, root), "utf8");

test("Integrações ocupa uma tab horizontal própria do Admin", async () => {
  const routing = await read("lib/admin-routing.ts");
  const consoleSource = await read("modules/admin/admin-console.tsx");
  assert.equal(buildAdminPath("integracoes"), "/admin?tab=integracoes");
  assert.equal(isAdminTab("integracoes"), true);
  assert.match(routing, /"integracoes"/);
  assert.match(consoleSource, /PlatformIntegrationsPanel/);
  assert.match(consoleSource, /label: "Integrações"/);
  assert.match(consoleSource, /data-global-page-tabs/);
  assert.doesNotMatch(consoleSource, /bg-slate|text-slate|border-slate|indigo|purple|violet|fuchsia|lilac|lavender/i);
  assert.doesNotMatch(consoleSource, /sidebar|navega[cç][aã]o lateral/i);
});

test("leitura usa somente a camada server-side real e sanitiza secrets", async () => {
  const route = await read("app/api/admin/integrations/route.ts");
  const service = await read("lib/server/platform-integrations-admin.ts");
  const panel = await read("modules/admin/platform-integrations-panel.tsx");
  for (const table of ["integration_providers", "integration_capabilities", "integration_connections", "integration_grants", "integration_bindings", "integration_quota_policies", "integration_usage_events"]) {
    assert.match(service, new RegExp(`from\\("${table}"\\)`));
  }
  assert.match(route, /requireCanonicalPlatformAdmin/);
  assert.match(route, /createCanonicalServiceClient/);
  assert.doesNotMatch(panel, /SUPABASE_SERVICE_ROLE_KEY|secret_ref/);
  assert.match(panel, /type="password"/);
  assert.match(service, /secretConfigured: Boolean\(row\.secret_ref/);
  assert.match(panel, /DEEPSEEK_BASE_URL/);
});

test("catálogos permanecem separados e OpenRouter não é cadastrado como provider operacional", async () => {
  const service = await read("lib/server/platform-integrations-admin.ts");
  const panel = await read("modules/admin/platform-integrations-panel.tsx");
  assert.match(service, /createPlatformIntegrationProvider/);
  assert.match(service, /createPlatformIntegrationCapability/);
  assert.match(service, /providerKey === "serper"/);
  assert.match(service, /providerKey === "rapidapi"/);
  assert.match(panel, /Quem fornece tecnicamente o recurso/);
  assert.match(panel, /O que o produto permite fazer, independentemente do provider/);
  assert.match(panel, /Google Ads/);
  assert.match(panel, /DataForSEO/);
  assert.match(panel, /DeepSeek/);
  assert.match(panel, /key: "deepseek"/);
  assert.doesNotMatch(panel, /OpenRouter/);
  assert.match(panel, /sem fallback silencioso/);
  assert.match(panel, /Distribuição por Agência/);
  assert.match(panel, /Configurações das APIs/);
  assert.match(panel, /role="tablist"/);
  assert.doesNotMatch(panel, /bg-slate|text-slate|border-slate|indigo|purple|violet|fuchsia|lilac|lavender/i);
});

test("fluxo humano reutiliza o secret store e mantém governança técnica avançada", async () => {
  const service = await read("lib/server/platform-integrations-admin.ts");
  const panel = await read("modules/admin/platform-integrations-panel.tsx");
  assert.match(service, /owner_scope_type: "platform"/);
  assert.match(service, /owner_agency_id: null/);
  assert.match(service, /owner_brand_id: null/);
  assert.match(service, /lifecycle_status: "draft"/);
  assert.match(service, /secret_ref: null/);
  assert.match(service, /configureSupportedPlatformProvider/);
  assert.match(service, /createIntegrationSecretStore\(client\)/);
  assert.match(panel, /Salvar configuração/);
  assert.match(panel, /Secret Store\/Vault existente/);
  assert.match(panel, /Catálogo técnico \(avançado\)/);
  assert.match(panel, /Criar connection em DRAFT/);
});

test("grants, quotas e usage têm estados vazios reais e não usam first-match", async () => {
  const service = await read("lib/server/platform-integrations-admin.ts");
  const panel = await read("modules/admin/platform-integrations-panel.tsx");
  assert.match(panel, /Nenhuma concessão de acesso registrada/);
  assert.match(panel, /Nenhum limite de consumo cadastrado/);
  assert.match(panel, /Nenhum consumo registrado/);
  assert.doesNotMatch(service, /\[0\]/);
  assert.doesNotMatch(service, /\.limit\(1\)/);
  assert.match(panel, /Ilimitado/);
  assert.match(panel, /Limites de consumo/);
});

test("nenhuma chamada externa ou test_connection é criada ao abrir a tela", async () => {
  const route = await read("app/api/admin/integrations/route.ts");
  const panel = await read("modules/admin/platform-integrations-panel.tsx");
  assert.doesNotMatch(route, /fetch\(|resend|googleapis/i);
  assert.doesNotMatch(panel, /test_connection|dispatch_once|resend|fetch\("https?:/i);
});

test("Admin expõe configurações canônicas sem health check automático", async () => {
  const route = await read("app/api/admin/integrations/route.ts");
  const service = await read("lib/server/platform-integrations-admin.ts");
  const panel = await read("modules/admin/platform-integrations-panel.tsx");
  const modelConfig = await read("lib/deepseek-model-config.ts");
  for (const label of ["Google Ads", "DataForSEO", "DeepSeek", "DATAFORSEO_LOGIN", "DATAFORSEO_PASSWORD", "DEEPSEEK_BASE_URL", "DEEPSEEK_DEFAULT_MODEL", "Developer Token", "OAuth Refresh Token", "Secret Store", "API Key", "Salvar configuração"]) {
    assert.match(panel, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(modelConfig, /deepseek-v4-pro/);
  assert.doesNotMatch(panel, /GOOGLE_ADS_API_VERSION/);
  assert.match(panel, /configure_supported_platform_provider/);
  assert.match(route, /case "configure_supported_platform_provider"/);
  assert.match(route, /case "update_google_ads_research_customer_id"/);
  assert.doesNotMatch(route, /update_openrouter_model/);
  assert.match(service, /SUPPORTED_PLATFORM_PROVIDER_KEYS/);
  assert.match(service, /ensureSupportedPlatformConnection/);
  assert.match(service, /lifecycle_status: "pending"/);
  assert.doesNotMatch(panel, /localStorage|sessionStorage/);
  assert.doesNotMatch(panel, /secret_ref/);
  assert.doesNotMatch(service, /updateOpenRouterModel|writeOpenRouterModel/);
  assert.match(panel, /DEEPSEEK_BASE_URL/);
  assert.match(panel, /readOnly/);
  assert.match(panel, /health check/);
  assert.doesNotMatch(panel, /Configuração remota ainda não realizada|não cadastra segredo/);
  assert.doesNotMatch(service, /INTEGRATIONS_REMOTE_CONFIGURATION_PENDING|DEEPSEEK_REMOTE_CONFIGURATION_PENDING/);
  assert.match(service, /deepseek_model: DEEPSEEK_DEFAULT_MODEL/);
});

test("política de homologação materializa a cadeia canônica sem bypass", async () => {
  const route = await read("app/api/admin/integrations/route.ts");
  const service = await read("lib/server/platform-integrations-admin.ts");
  const panel = await read("modules/admin/platform-integrations-panel.tsx");
  assert.match(service, /PLATFORM_ACCESS_POLICY = "HOMOLOGATION_ALLOW_ALL"/);
  assert.match(service, /applyPlatformHomologationPolicy/);
  assert.match(service, /ensurePlatformGrantedBrandAccess/);
  assert.match(service, /source_kind: "platform_granted"/);
  assert.match(service, /window_kind: "none"/);
  assert.match(service, /limit_units: null/);
  assert.match(service, /integration_quota_policies/);
  assert.match(service, /mappedCapabilities\.filter\(\(item\).*item\.providerKey !== "google_ads"/);
  assert.match(service, /googleAdsPersistedDistribution: "excluded_platform_env_only"/);
  assert.match(route, /case "apply_platform_homologation_policy"/);
  assert.match(panel, /Homologa[cç][aã]o: recursos da Plataforma dispon[ií]veis para todas as Ag[eê]ncias ativas/);
  assert.match(panel, /Aplicar homologa[cç][aã]o/);
  assert.match(panel, /Google Ads continua exigindo Customer ID externo/);
  assert.doesNotMatch(service, /HOMOLOGATION_ALLOW_ALL[^\n]*return\s+true/);
});

test("distribuição ativa não oferece grants manuais por capability", async () => {
  const panel = await read("modules/admin/platform-integrations-panel.tsx");
  assert.match(panel, /data\.platformAccessPolicy/);
  assert.match(panel, /Disponibilidade dos resources da Plataforma/);
  for (const resource of ["Google Ads", "DataForSEO", "DeepSeek"]) assert.match(panel, new RegExp(resource));
  assert.doesNotMatch(panel, /OpenRouter/);
  assert.match(panel, /Distribuição por Agência/);
  assert.doesNotMatch(panel, /Configuração avançada\/futura[^\n]*grants manuais por capability/);
  assert.doesNotMatch(panel, /Conceder e criar binding da Agência/);
  assert.doesNotMatch(panel, /agencyGrantForm|grantPlatformToAgency/);
});

test("bootstrap canônico cria somente capabilities ativas com consumidores ou contratos atuais", async () => {
  const route = await read("app/api/admin/integrations/route.ts");
  const service = await read("lib/server/platform-integrations-admin.ts");
  const panel = await read("modules/admin/platform-integrations-panel.tsx");
  for (const key of ["dataforseo.allintitle", "dataforseo.serp_compatibility", "google_ads_keyword_discovery", "google_ads_keyword_metrics", "ai_generation"]) {
    assert.match(service, new RegExp(`capabilityKey: "${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`));
  }
  assert.match(service, /bootstrapPlatformCapabilityCatalog/);
  assert.match(service, /expectedCount: PLATFORM_CAPABILITY_CATALOG\.length/);
  assert.match(service, /schemaChanged: false/);
  assert.match(service, /connectionsCreated: 0/);
  assert.match(service, /secretsCreated: 0/);
  assert.doesNotMatch(service, /capabilityKey: "serper/);
  assert.match(route, /case "bootstrap_platform_capability_catalog"/);
  assert.match(panel, /Bootstrap catálogo canônico/);
});
