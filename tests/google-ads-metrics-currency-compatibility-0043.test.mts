import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile("supabase/migrations/0043_google_ads_metrics_currency_compatibility.sql", "utf8");
const preflight = await readFile("supabase/scripts/0043-google-ads-metrics-currency-compatibility-preflight-read-only.sql", "utf8");
const verifier = await readFile("supabase/scripts/0043-google-ads-metrics-currency-compatibility-post-verifier-read-only.sql", "utf8");
const rollback = await readFile("supabase/scripts/0043-google-ads-metrics-currency-compatibility-rollback.sql", "utf8");
const contractTest = await readFile("supabase/scripts/0043-google-ads-metrics-currency-compatibility-contract-test-local.sql", "utf8");

function acceptsCurrencyCode(value: string | null) {
  return value === null || /^[A-Z]{3}$/.test(value);
}

function assertReadOnly(script: string) {
  assert.match(script, /^(?:\s*--[^\n]*\n)*\s*WITH\b/i);
  assert.doesNotMatch(script, /(?:^|[;\n]\s*)(?:INSERT|UPDATE|DELETE|MERGE|CREATE|ALTER|DROP|TRUNCATE|GRANT|REVOKE|CALL)\b/i);
}

test("0043 altera somente a nullability de currency_code", () => {
  assert.match(migration, /BEGIN;[\s\S]*COMMIT;/i);
  assert.match(migration, /ALTER TABLE public\.minerador_keyword_metric_measurements\s+ALTER COLUMN currency_code DROP NOT NULL/i);
  assert.doesNotMatch(migration, /\b(?:ADD|DROP) CONSTRAINT\b|\b(?:INSERT|UPDATE|DELETE|TRUNCATE|GRANT|REVOKE)\b/i);
  assert.doesNotMatch(migration, /\b(?:time_zone|integration_usage_events|minerador_google_ads_connections)\b/i);
});

test("preflight e post-verifier preservam todas as invariantes da baseline remota", () => {
  assertReadOnly(preflight);
  assertReadOnly(verifier);
  for (const marker of ["constraints", "foreign_keys", "indexes", "triggers", "policies", "rls", "owner", "acl", "non_target_structure"]) {
    assert.match(preflight, new RegExp(`['\"]${marker}['\"]`));
    assert.match(verifier, new RegExp(`['\"]${marker}['\"]`));
  }
  assert.match(preflight, /0043-google-ads-metrics-currency-compatibility-preflight-v1/);
  assert.match(verifier, /0043-google-ads-metrics-currency-compatibility-preflight-v1/);
  assert.match(verifier, /baseline_bound_to_remote_preflight/);
  assert.match(verifier, /invariant_fingerprints_preserved/);
  assert.match(verifier, /data_delta_zero/);
  assert.match(verifier, /"non_target_structure":"37c11bb2a89996154f51dfeedc8f341c"/);
  assert.match(verifier, /"data_snapshot":\{"total_rows":0,"currency_codes":\[\],"currency_code_null_rows":0\}/);
});

test("rollback bloqueia quando moeda desconhecida já foi persistida", () => {
  assert.match(rollback, /LOCK TABLE public\.minerador_keyword_metric_measurements IN ACCESS EXCLUSIVE MODE/i);
  assert.match(rollback, /WHERE currency_code IS NULL/i);
  assert.match(rollback, /GOOGLE_ADS_METRICS_CURRENCY_ROLLBACK_BLOCKED/i);
  assert.match(rollback, /ALTER COLUMN currency_code SET NOT NULL/i);
  assert.doesNotMatch(rollback, /\b(?:INSERT|UPDATE|DELETE|TRUNCATE)\b/i);
});

test("teste PostgreSQL reversível aceita NULL e BRL e rejeita código inválido", () => {
  assert.match(contractTest, /^\s*--[\s\S]*\bBEGIN;/i);
  assert.match(contractTest, /VALUES \(NULL\)/i);
  assert.match(contractTest, /VALUES \('BRL'\)/i);
  assert.match(contractTest, /VALUES \('brl'\)/i);
  assert.match(contractTest, /WHEN check_violation THEN NULL/i);
  assert.match(contractTest, /ROLLBACK;\s*$/i);
  assert.equal(acceptsCurrencyCode(null), true);
  assert.equal(acceptsCurrencyCode("BRL"), true);
  assert.equal(acceptsCurrencyCode("brl"), false);
  assert.equal(acceptsCurrencyCode("US"), false);
});
