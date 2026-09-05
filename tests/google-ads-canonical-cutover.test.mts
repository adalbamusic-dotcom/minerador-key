import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationPath = new URL("../supabase/migrations/0033_google_ads_canonical_binding_configuration.sql", import.meta.url);
const preflightPath = new URL("../supabase/scripts/google-ads-0033-preflight-read-only.sql", import.meta.url);
const postVerifierPath = new URL("../supabase/scripts/google-ads-0033-post-verification-read-only.sql", import.meta.url);
const rollbackPath = new URL("../supabase/scripts/google-ads-0033-rollback.sql", import.meta.url);
const canonicalPath = new URL("../lib/server/google-ads-canonical.ts", import.meta.url);
const connectionRoutePath = new URL("../app/api/minerador/marcas/[brandId]/google-ads/conexao/route.ts", import.meta.url);
const discoveryRoutePath = new URL("../app/api/minerador/marcas/[brandId]/google-ads/descobrir-keywords/route.ts", import.meta.url);
const metricsRoutePath = new URL("../app/api/minerador/marcas/[brandId]/google-ads/metricas-keywords/route.ts", import.meta.url);

async function read(url: URL) {
  return readFile(url, "utf8");
}

function assertReadOnly(sql: string) {
  assert.doesNotMatch(sql, /(?:^|\n)\s*(?:INSERT|UPDATE|DELETE|MERGE|CREATE|ALTER|DROP|TRUNCATE)\b/i);
  assert.doesNotMatch(sql, /\b(?:TEMP\s+TABLE|CASCADE)\b/i);
  assert.equal((sql.match(/;\s*$/gm) || []).length, 1);
}

test("0033 cria somente configuração tipada por binding e mantém os identificadores externos fora da tabela", async () => {
  const sql = await read(migrationPath);
  assert.match(sql, /CREATE TABLE public\.google_ads_binding_targeting/);
  assert.match(sql, /CREATE TABLE public\.google_ads_binding_account_state/);
  assert.match(sql, /binding_id uuid NOT NULL UNIQUE\s+REFERENCES public\.integration_bindings\(id\) ON DELETE RESTRICT/);
  for (const field of ["language_constant", "geo_target_constants", "keyword_plan_network", "include_adult_keywords", "currency_code", "time_zone", "validation_status", "validated_at"]) assert.match(sql, new RegExp(`\\b${field}\\b`));
  assert.match(sql, /cardinality\(geo_target_constants\) BETWEEN 1 AND 10/);
  assert.match(sql, /GOOGLE_ADS_0033_TARGETING_DUPLICATE_GEO_TARGET/);
  assert.doesNotMatch(sql, /CREATE TABLE[^;]+minerador_google_ads_connections/i);
  assert.doesNotMatch(sql, /secret_ref|manager_customer_id|customer_id/i);
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /REVOKE ALL PRIVILEGES ON TABLE/);
  assert.match(sql, /GRANT SELECT, INSERT, UPDATE ON TABLE[\s\S]*TO service_role/);
  assert.match(sql, /google_ads_binding_configuration_validate/);
});

test("preflight e post-verifier são catálogos read-only em um único result set", async () => {
  const [preflight, postVerifier] = await Promise.all([read(preflightPath), read(postVerifierPath)]);
  assertReadOnly(preflight);
  assertReadOnly(postVerifier);
  assert.match(preflight, /2026-08-12-google-ads-0033-preflight-v2/);
  assert.match(postVerifier, /2026-08-12-google-ads-0033-post-v2/);
  assert.match(preflight, /PRE_0033_PRESERVED_CATALOG_FINGERPRINT/);
  assert.match(preflight, /PRE_0033_ACL_RLS_SNAPSHOT/);
  assert.match(preflight, /LEGACY_TABLE_EVIDENCE/);
  assert.match(postVerifier, /585a1424c29f0e813c34034aa39eadd4/);
  assert.match(postVerifier, /EVIDENCE_GAP/);
  const fingerprintStart = "target_relations AS (";
  const preFingerprintEnd = "integration_expected(table_name) AS (";
  const postFingerprintEnd = "expected_columns(table_name, column_name) AS (";
  const preFingerprintBlock = preflight.slice(preflight.indexOf(fingerprintStart), preflight.indexOf(preFingerprintEnd)).trim();
  const postFingerprintBlock = postVerifier.slice(postVerifier.indexOf(fingerprintStart), postVerifier.indexOf(postFingerprintEnd)).trim();
  assert.equal(preFingerprintBlock, postFingerprintBlock);
  assert.match(preflight, /md5\(string_agg\(canonical_line, '\|' ORDER BY canonical_line\)\)/);
  assert.match(postVerifier, /md5\(string_agg\(canonical_line, '\|' ORDER BY canonical_line\)\)/);
  assert.match(postVerifier, /google_ads_binding_targeting/);
  assert.match(postVerifier, /google_ads_binding_account_state/);
  assert.match(postVerifier, /on_delete_restrict/);
  assert.match(postVerifier, /privileges/);
  assert.match(postVerifier, /constraints/);
  assert.match(postVerifier, /validator:function/);
  assert.match(postVerifier, /validator:triggers/);
  assert.match(postVerifier, /legacy_runtime_reads_writes/);
});

test("rollback é artefato local explícito e não remove o legado", async () => {
  const sql = await read(rollbackPath);
  assert.match(sql, /\nBEGIN;/);
  assert.match(sql, /COMMIT;\s*$/);
  assert.doesNotMatch(sql, /CASCADE/i);
  assert.doesNotMatch(sql, /DROP TABLE public\.minerador_google_ads_connections/i);
  assert.doesNotMatch(sql, /DROP TABLE public\.integration_bindings/i);
});

test("rotas Google Ads usam somente a infraestrutura server-side da Plataforma", async () => {
  const [connection, discovery, metrics, canonical] = await Promise.all([read(connectionRoutePath), read(discoveryRoutePath), read(metricsRoutePath), read(canonicalPath)]);
  for (const source of [connection, discovery, metrics]) {
    assert.doesNotMatch(source, /minerador_google_ads_connections/);
    assert.match(source, /resolveGoogleAdsCanonicalContext/);
  }
  assert.match(canonical, /getGoogleAdsStaticPlatformConfig/);
  assert.match(canonical, /GOOGLE_ADS_PLATFORM_RESEARCH_CUSTOMER_MISSING/);
  assert.match(canonical, /GOOGLE_ADS_TARGETING_INVALID/);
  assert.match(canonical, /GOOGLE_ADS_DISCOVERY_STATE_GEO_TARGETS/);
  assert.match(canonical, /resolveGoogleAdsPlatformConfig/);
  assert.match(canonical, /createIntegrationSecretStore/);
  assert.match(canonical, /integration_connections/);
  assert.match(canonical, /secret_ref/);
});

test("consumidores Google Ads usam as capabilities canônicas do Minerador", async () => {
  const canonical = await read(canonicalPath);
  assert.match(canonical, /discovery:\s*"google_ads_keyword_discovery"/);
  assert.match(canonical, /metrics:\s*"google_ads_keyword_metrics"/);
  assert.doesNotMatch(canonical, /google_ads\.keyword_(?:discovery|metrics)/);
});

test("Discovery e Metrics usam Research Customer ID global sem exigir binding da Brand", async () => {
  const [canonical, discovery, metrics] = await Promise.all([read(canonicalPath), read(discoveryRoutePath), read(metricsRoutePath)]);
  assert.match(canonical, /researchCustomerId/);
  assert.match(canonical, /GOOGLE_ADS_PLATFORM_RESEARCH_CUSTOMER_MISSING/);
  assert.match(canonical, /customerId: config\.researchCustomerId/);
  assert.match(discovery, /customerId: canonicalContext\.customerId/);
  assert.match(metrics, /customerId: canonicalContext\.customerId/);
  assert.doesNotMatch(discovery, /GOOGLE_ADS_CUSTOMER_MISSING/);
  assert.doesNotMatch(metrics, /GOOGLE_ADS_CUSTOMER_MISSING/);
});

test("configuração canônica rejeita targeting divergente e não consulta persistência dinâmica", async () => {
  const source = await read(canonicalPath);
  assert.match(source, /GOOGLE_ADS_TARGETING_MISMATCH/);
  assert.match(source, /canonicalTargetingEquals/);
  assert.match(source, /getGoogleAdsStaticPlatformConfig/);
  assert.match(source, /resolveGoogleAdsPlatformConfig/);
  assert.match(source, /Secret Store/);
});
