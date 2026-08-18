import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile("supabase/migrations/0042_google_ads_infrastructure_usage_ledger.sql", "utf8");
const preflight = await readFile("supabase/scripts/0042-google-ads-infrastructure-usage-ledger-preflight-read-only.sql", "utf8");
const verifier = await readFile("supabase/scripts/0042-google-ads-infrastructure-usage-ledger-post-verifier-read-only.sql", "utf8");
const sqlEditorRunner = await readFile("supabase/scripts/0042-google-ads-infrastructure-usage-ledger-post-verifier-bound-sql-editor.sql", "utf8");
const rollback = await readFile("supabase/scripts/0042-google-ads-infrastructure-usage-ledger-rollback.sql", "utf8");
const usageRuntime = await readFile("lib/server/integrations-runtime.ts", "utf8");
const googleAdsUsage = await readFile("lib/minerador/google-ads-discovery-usage.ts", "utf8");
const sdd = await readFile("docs/compartilhado/sdd-google-ads-infrastructure-usage-ledger-2026-08-16.md", "utf8");

function readOnly(script: string) {
  assert.match(script, /^(?:\s*--[^\n]*\n)*\s*WITH\b/i);
  assert.doesNotMatch(script, /(?:^|[;\n]\s*)(?:INSERT|UPDATE|DELETE|MERGE|CREATE|ALTER|DROP|TRUNCATE|GRANT|REVOKE|CALL)\b/i);
}

function cteBody(script: string, name: string, nextName: string) {
  const marker = `${name} AS (`;
  const nextMarker = `),\n${nextName} AS (`;
  const start = script.indexOf(marker);
  const end = script.indexOf(nextMarker, start);
  assert.ok(start >= 0 && end > start, `CTE ${name} deve permanecer separada de ${nextName}`);
  return script.slice(start, end);
}

function aggregateArguments(script: string) {
  const calls = /\b(?:jsonb_agg|json_agg|jsonb_object_agg|array_agg)\s*\(/g;
  const bodies: string[] = [];
  for (let match = calls.exec(script); match; match = calls.exec(script)) {
    let depth = 1;
    let index = calls.lastIndex;
    for (; index < script.length && depth > 0; index += 1) {
      if (script[index] === "(") depth += 1;
      if (script[index] === ")") depth -= 1;
    }
    assert.equal(depth, 0, "chamada aggregate deve ter parênteses balanceados");
    bodies.push(script.slice(calls.lastIndex, index - 1));
    calls.lastIndex = index;
  }
  return bodies;
}

function assertNoNestedAggregates(script: string) {
  const scalarAggregate = /\b(?:count|sum|min|max|avg|bool_and|bool_or|string_agg|array_agg)\s*\(/;
  for (const argument of aggregateArguments(script)) assert.doesNotMatch(argument, scalarAggregate);
}

test("0042 altera somente a nullability e a idempotência de infraestrutura", () => {
  assert.match(migration, /ALTER TABLE public\.integration_usage_events\s+ALTER COLUMN connection_id DROP NOT NULL/i);
  assert.match(migration, /CREATE UNIQUE INDEX uq_integration_usage_events_infrastructure_idempotency_0042/i);
  assert.match(migration, /\(provider_id, environment, idempotency_key\)\s+WHERE connection_id IS NULL/i);
  assert.match(migration, /BEGIN;[\s\S]*COMMIT;/i);
  assert.doesNotMatch(migration, /\b(?:INSERT|UPDATE|DELETE|MERGE|DROP CONSTRAINT|ADD CONSTRAINT|ALTER COLUMN capability_id|GRANT|REVOKE)\b/i);
  assert.doesNotMatch(migration, /integration_connections|integration_grants|integration_bindings|secret_ref|vault/i);
});

test("preflight e post-verifier capturam e conferem invariantes sem escrita", () => {
  readOnly(preflight);
  readOnly(verifier);
  assert.match(preflight, /connection_id_not_null/);
  assert.match(preflight, /c\.confmatchtype/);
  assert.doesNotMatch(preflight, /c\.conmatchtype/);
  assert.match(preflight, /WHEN 's' THEN 'SIMPLE'/);
  assert.match(preflight, /WHEN 'f' THEN 'FULL'/);
  assert.match(preflight, /WHEN 'p' THEN 'PARTIAL'/);
  assert.match(preflight, /composite_fk_match_type/);
  assert.match(preflight, /composite_connection_provider_fk_match_simple/);
  assert.match(preflight, /google_ads_historical_connection_refs/);
  assert.match(preflight, /usage_by_provider_rows AS/);
  assert.match(preflight, /usage_by_provider AS/);
  const preflightRows = cteBody(preflight, "usage_by_provider_rows", "usage_by_provider");
  const preflightJson = cteBody(preflight, "usage_by_provider", "data_snapshot");
  assert.match(preflightRows, /count\(/);
  assert.doesNotMatch(preflightRows, /jsonb_agg|json_agg|jsonb_object_agg|array_agg/);
  assert.match(preflightJson, /jsonb_agg\(jsonb_build_object/);
  assert.doesNotMatch(preflightJson, /\b(?:count|sum|min|max|avg|bool_and|bool_or|string_agg|array_agg)\s*\(/);
  assertNoNestedAggregates(preflight);
  assert.doesNotMatch(preflight, /total_events = 11|google_ads_historical_connection_refs = 4/);
  assert.match(verifier, /current_setting\('minerador\.baseline_0042_json', true\)/);
  assert.match(verifier, /c\.confmatchtype/);
  assert.doesNotMatch(verifier, /c\.conmatchtype/);
  assert.match(verifier, /ARRAY\(SELECT a\.attname::text/);
  assert.match(verifier, /columns = ARRAY\['provider_id', 'environment', 'idempotency_key'\]::text\[\]/);
  assert.doesNotMatch(verifier, /ARRAY\(SELECT a\.attname\s*(?:\r?\n|FROM)/);
  assert.doesNotMatch(verifier, /::name\[\]/);
  assert.match(verifier, /composite_fk_match_type/);
  assert.match(verifier, /current_usage_by_provider_rows AS/);
  assert.match(verifier, /current_usage_by_provider AS/);
  const verifierRows = cteBody(verifier, "current_usage_by_provider_rows", "current_usage_by_provider");
  const verifierJson = cteBody(verifier, "current_usage_by_provider", "current_data");
  assert.match(verifierRows, /count\(/);
  assert.doesNotMatch(verifierRows, /jsonb_agg|json_agg|jsonb_object_agg|array_agg/);
  assert.match(verifierJson, /jsonb_agg\(jsonb_build_object/);
  assert.doesNotMatch(verifierJson, /\b(?:count|sum|min|max|avg|bool_and|bool_or|string_agg|array_agg)\s*\(/);
  assertNoNestedAggregates(verifier);
  assert.doesNotMatch(verifier, /google_ads_historical_connection_refs' = '4'/);
  assert.match(verifier, /connection_now_nullable/);
  assert.match(verifier, /infrastructure_partial_unique_ok/);
  assert.match(verifier, /non_target_unchanged/);
  assert.match(verifier, /data_delta_zero/);
  assert.match(verifier, /composite_fk_preserved/);
  assert.match(verifier, /capability_fk_preserved/);
});

test("rollback falha fechado diante de eventos append-only sem Connection", () => {
  assert.match(rollback, /LOCK TABLE public\.integration_usage_events IN ACCESS EXCLUSIVE MODE/i);
  assert.match(rollback, /WHERE connection_id IS NULL/i);
  assert.match(rollback, /GOOGLE_ADS_INFRASTRUCTURE_USAGE_ROLLBACK_BLOCKED/i);
  assert.match(rollback, /DROP INDEX public\.uq_integration_usage_events_infrastructure_idempotency_0042/i);
  assert.match(rollback, /ALTER COLUMN connection_id SET NOT NULL/i);
  assert.doesNotMatch(rollback, /\b(?:INSERT|UPDATE|DELETE|MERGE)\b/i);
});

test("runner SQL Editor incorpora o evidence_json oficial na mesma sessão", () => {
  const embedded = sqlEditorRunner.match(/\$baseline_0042\$\n([\s\S]*?)\n  \$baseline_0042\$,/);
  assert.ok(embedded, "o evidence_json precisa permanecer em dollar-quoting seguro");
  assert.equal(
    createHash("sha256").update(embedded[1], "utf8").digest("hex"),
    "246756d809cdbe76f0b50241228d575f4e08f721335702077a8cae082cd667e6",
  );
  assert.match(sqlEditorRunner, /set_config\(\s*'minerador\.baseline_0042_json',/);
  assert.match(sqlEditorRunner, /current_setting\('minerador\.baseline_0042_json', true\)/);
  assert.match(sqlEditorRunner, /ARRAY\(SELECT a\.attname::text/);
  assert.match(sqlEditorRunner, /columns = ARRAY\['provider_id', 'environment', 'idempotency_key'\]::text\[\]/);
  assert.doesNotMatch(sqlEditorRunner, /ARRAY\(SELECT a\.attname\s*(?:\r?\n|FROM)/);
  assert.doesNotMatch(sqlEditorRunner, /::name\[\]/);
  assert.doesNotMatch(sqlEditorRunner, /\\ir\b/);
  assert.doesNotMatch(sqlEditorRunner, /(?:^|[;\n]\s*)(?:INSERT|UPDATE|DELETE|MERGE|CREATE|ALTER|DROP|TRUNCATE|GRANT|REVOKE)\b/i);
  assert.ok(sqlEditorRunner.replace(/\r\n/g, "\n").trimEnd().endsWith(verifier.replace(/\r\n/g, "\n").trimEnd()));
});

test("Google Ads Usage usa apenas a classificação técnica de infraestrutura", () => {
  assert.match(usageRuntime, /resolveGoogleAdsInfrastructureUsageForActor/);
  assert.match(usageRuntime, /recordGoogleAdsInfrastructureUsage/);
  assert.match(usageRuntime, /connection_id: null/);
  assert.match(usageRuntime, /findInfrastructureUsageByIdempotency/);
  assert.match(googleAdsUsage, /resolveGoogleAdsInfrastructureUsageForActor/);
  assert.match(googleAdsUsage, /recordGoogleAdsInfrastructureUsage/);
  assert.doesNotMatch(googleAdsUsage, /resolveIntegrationResourceForActor|resolveHomologationResourceForActor|secret_ref|vault/i);
});

test("SDD incorpora o inventário remoto e preserva o histórico Google Ads", () => {
  assert.match(sdd, /PASS_READ_ONLY_INVENTORY/);
  assert.match(sdd, /Google Ads \| 4 \| 4 \| 0 \| 0/);
  assert.match(sdd, /DATA_MIGRATION_REQUIRED = NO/);
  assert.match(sdd, /não haverá backfill, conversão para `NULL`, remoção da Connection/i);
});
