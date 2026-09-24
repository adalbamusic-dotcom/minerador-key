import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

/*
 * F1b.8 e F1b.11 (estruturais) — catálogo do ledger, migration e fronteiras da
 * rota da Pesquisa por Assunto. Leitura de arquivo, sem rede e sem banco.
 * Comentários são removidos antes de casar: um teste estrutural não pode casar
 * com o próprio comentário do código.
 */

const root = new URL("../", import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root), "utf8");

function stripComments(source: string) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");
}

function stripSqlComments(source: string) {
  return source.replace(/--.*$/gm, "");
}

const runtime = stripComments(read("lib/server/integrations-runtime.ts"));
const admin = stripComments(read("lib/server/platform-integrations-admin.ts"));
const canonical = stripComments(read("lib/server/dataforseo-canonical.ts"));
const migrationRaw = read("supabase/migrations/20260924120000_dataforseo_keyword_research_operation.sql");
const migration = stripSqlComments(migrationRaw);
const route = stripComments(read("app/api/minerador/marcas/[brandId]/subject-discovery/search/route.ts"));
const search = stripComments(read("lib/minerador/subject-discovery-search.ts"));
const plan = stripComments(read("lib/minerador/subject-discovery-plan.ts"));
const labs = stripComments(read("lib/minerador/dataforseo-labs-keyword-research-core.ts"));
const usage = stripComments(read("lib/minerador/google-ads-discovery-usage.ts"));

test("runtime: keyword_research é operação do recurso DataForSEO, com a capability única", () => {
  const operations = runtime.match(/INTEGRATION_CAPABILITY_OPERATIONS = \[[\s\S]*?\] as const;/)?.[0] || "";
  assert.match(operations, /"keyword_research"/);
  for (const previous of ["ai_generation", "keyword_discovery", "keyword_metrics", "allintitle", "serp_compatibility", "transactional_email", "speech_transcription", "storage_media", "youtube_video_metadata", "telegram_message_send", "telegram_file_fetch"]) {
    assert.match(operations, new RegExp(`"${previous}"`), previous);
  }
  const resourceMap = runtime.match(/INTEGRATION_RESOURCE_BY_OPERATION:[\s\S]*?\n};/)?.[0] || "";
  assert.match(resourceMap, /keyword_research:\s*"dataforseo"/);
  const providerRequirements = runtime.match(/INTEGRATION_CAPABILITY_PROVIDER_REQUIREMENTS[\s\S]*?\n};/)?.[0] || "";
  assert.match(providerRequirements, /"dataforseo\.keyword_research":\s*"dataforseo"/);
});

test("Admin: o bootstrap conhece a capability dataforseo.keyword_research (production, request)", () => {
  const catalog = admin.match(/PLATFORM_CAPABILITY_CATALOG = \[[\s\S]*?\n\] as const;/)?.[0] || "";
  assert.match(catalog, /\{ capabilityKey: "dataforseo\.keyword_research", providerKey: "dataforseo", operationKind: "keyword_research", unitName: "request" \}/);
  assert.match(catalog, /capabilityKey: "dataforseo\.allintitle"/);
  assert.match(catalog, /capabilityKey: "dataforseo\.serp_compatibility"/);
  assert.doesNotMatch(catalog, /serper|rapidapi/i);
});

test("resolver: a Pesquisa por Assunto tem resolver próprio, sem reusar allintitle nem serp_compatibility", () => {
  assert.match(canonical, /DATAFORSEO_KEYWORD_RESEARCH_CAPABILITY_KEY = "dataforseo\.keyword_research"/);
  assert.match(canonical, /type DataForSeoCanonicalOperation = "allintitle" \| "serp_compatibility" \| "keyword_research";/);
  assert.match(canonical, /resolveDataForSeoCanonicalOperationConfig\(input, "keyword_research", DATAFORSEO_KEYWORD_RESEARCH_CAPABILITY_KEY\)/);
});

test("migration: CHECK com 12 valores, capability com ON CONFLICT DO NOTHING e só catálogo", () => {
  const check = migration.match(/CHECK \(operation_kind IN \(([\s\S]*?)\)\)/)?.[1] || "";
  const values = [...check.matchAll(/'([a-z_]+)'/g)].map(match => match[1]);
  assert.equal(values.length, 12);
  assert.equal(new Set(values).size, 12);
  assert.ok(values.includes("keyword_research"));
  assert.ok(values.includes("telegram_file_fetch"));
  assert.match(migration, /INSERT INTO public\.integration_capabilities \(capability_key, operation_kind, environment, unit_name, status\)\s*VALUES \('dataforseo\.keyword_research', 'keyword_research', 'production', 'request', 'active'\)\s*ON CONFLICT \(capability_key\) DO NOTHING;/);
  assert.doesNotMatch(migration, /\bUPDATE\s+public\.|DELETE\s+FROM|DROP\s+TABLE|CREATE\s+TABLE|ALTER\s+TABLE\s+public\.minerador|POLICY/i);
  assert.doesNotMatch(migration, /secret_ref|password|api[_-]?key|token/i);
  // Rollback documentado: disabled, nunca apagar; e a verificação só leitura.
  assert.match(migrationRaw, /SET status = 'disabled'/);
  assert.match(migrationRaw, /NUNCA é apagada/);
  assert.match(migrationRaw, /VERIFICAÇÃO \(somente leitura/);
});

test("Google Ads: o sufixo é opcional nos dois pontos e sem ele a chave é a de hoje", () => {
  assert.match(usage, /export function googleAdsDiscoveryUsageKey\(operationRequestId: string, usageKeySuffix\?: GoogleAdsDiscoveryUsageKeySuffix \| null\)/);
  assert.match(usage, /const base = `google_ads:\$\{operationRequestId\}:keyword_discovery`;/);
  assert.match(usage, /idempotencyKey: googleAdsDiscoveryUsageKey\(input\.operationRequestId, input\.usageKeySuffix\)/);
});

test("rota: candidatas não vão ao banco — nada de minerador_discovery_*, RPC da Descoberta ou escrita em keywords", () => {
  assert.doesNotMatch(route, /minerador_discovery_|persist_minerador_discovery_run|\.rpc\(/);
  assert.doesNotMatch(route, /\.(insert|update|upsert|delete)\(/);
  assert.doesNotMatch(search, /\.from\(|\.rpc\(|supabase/);
  assert.doesNotMatch(route, /select\("\*"\)/);
});

test("rota: toda leitura filtra a marca da rota, com colunas estreitas", () => {
  assert.match(route, /from\("minerador_keywords"\)\s*\.select\("id,keyword,keyword_subject:analise_semantica->keyword_subject"\)\s*\.eq\("id", keywordId\)\s*\.eq\("brand_id", context\.brandId\)\s*\.is\("deleted_at", null\)/);
  assert.match(route, /from\("minerador_keywords"\)\s*\.select\("id,keyword"\)\s*\.eq\("brand_id", context\.brandId\)\s*\.is\("deleted_at", null\)/);
  assert.match(route, /from\("marcas"\)\.select\("id,site_url"\)\.eq\("id", context\.brandId\)/);
  assert.match(route, /requireTenantPermission\(\{ brandId, actorUserId: profile\.userId, module: "minerador", action: "edit", profile \}\)/);
});

test("rota: a credencial só é resolvida dentro de openExecution; o plano lê só o catálogo", () => {
  const open = route.indexOf("async openExecution()");
  assert.ok(open > 0);
  const resolver = route.indexOf("resolveDataForSeoCanonicalKeywordResearchConfig(");
  const googleAds = route.indexOf("resolveGoogleAdsCanonicalContext(");
  assert.ok(resolver > open, "o resolver DataForSEO vive dentro de openExecution");
  assert.ok(googleAds > open, "o Google Ads vive dentro de openExecution");
  const ledgerRead = route.slice(route.indexOf("async findLedgerCapability()"), route.indexOf("async readExistingKeywords()"));
  assert.match(ledgerRead, /findCapability\(/);
  assert.doesNotMatch(ledgerRead, /secret|resolveDataForSeoCanonical|findPlatformConnections|store\.resolve/i);
});

test("candidata só de provider: nenhum caminho de IA, e Serper/RapidAPI não voltam", () => {
  const aiProvider = /from ["'][^"']*(openai|anthropic|@ai-sdk|gemini|deepseek|ai-provider|llm)[^"']*["']/i;
  for (const [name, source] of [["route", route], ["search", search], ["plan", plan], ["labs", labs]] as const) {
    assert.doesNotMatch(source, aiProvider, name);
    assert.doesNotMatch(source, /serper|rapidapi/i, name);
  }
  assert.doesNotMatch(search, /setKeywordSubject|withdrawKeywordSubject|importSubjectsWithCore/);
  assert.doesNotMatch(route, /setKeywordSubject|withdrawKeywordSubject|importSubjectsWithCore/);
});

test("o Labs recebe só 2076 + \"pt\"; a UF nunca chega a ele", () => {
  assert.match(labs, /DATAFORSEO_LABS_LOCATION_CODE = 2076;/);
  assert.match(labs, /DATAFORSEO_LABS_LANGUAGE_CODE = "pt";/);
  assert.match(search, /const locale = \{ locationCode: DATAFORSEO_LABS_LOCATION_CODE, languageCode: DATAFORSEO_LABS_LANGUAGE_CODE \};/);
  assert.doesNotMatch(search, /geoTargetConstants[^\n]*runLabs|runLabs[^\n]*geoTargetConstants/);
});
