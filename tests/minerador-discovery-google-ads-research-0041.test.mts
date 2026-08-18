import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationPath = new URL("../supabase/migrations/0041_google_ads_research_persistence_constraints.sql", import.meta.url);
const preflightPath = new URL("../supabase/scripts/0041-google-ads-research-persistence-preflight-read-only.sql", import.meta.url);
const verifierPath = new URL("../supabase/scripts/0041-google-ads-research-persistence-post-verifier-read-only.sql", import.meta.url);
const rollbackPath = new URL("../supabase/scripts/0041-google-ads-research-persistence-rollback.sql", import.meta.url);

type RunFixture = {
  source: string;
  provider: string | null;
  providerVersion: string | null;
  seedOriginal: string | null;
  seedCanonical: string | null;
  relationshipMode: string | null;
  language: string | null;
  countryCode: string | null;
  countryLabel: string | null;
  languageConstant: string | null;
  selectedStates: string[] | null;
  stateLabels: string[] | null;
  geoTargetConstants: string[] | null;
  keywordPlanNetwork: string | null;
  includeAdultKeywords: boolean | null;
  currencyCode: string | null;
  timeZone: string | null;
};

type CandidateFixture = {
  source: string;
  provider: string | null;
  providerVersion: string | null;
  currencyCode: string | null;
  timeZone: string | null;
  targeting: Record<string, unknown> | null;
  measuredAt: string | null;
  averageMonthlySearches: number | null;
  monthlySearchVolumes: unknown[];
  competition: string | null;
  competitionIndex: number | null;
  lowTopOfPageBidMicros: number | null;
  highTopOfPageBidMicros: number | null;
  averageCpcMicros: number | null;
};

const completeRun = (overrides: Partial<RunFixture> = {}): RunFixture => ({
  source: "google_ads",
  provider: "google_ads",
  providerVersion: "v25",
  seedOriginal: "clinica",
  seedCanonical: "clinica",
  relationshipMode: "related",
  language: "pt-BR",
  countryCode: "BR",
  countryLabel: "Brasil",
  languageConstant: "languageConstants/1014",
  selectedStates: ["BR"],
  stateLabels: ["Brasil"],
  geoTargetConstants: ["geoTargetConstants/2076"],
  keywordPlanNetwork: "GOOGLE_SEARCH",
  includeAdultKeywords: false,
  currencyCode: null,
  timeZone: null,
  ...overrides,
});

const completeCandidate = (overrides: Partial<CandidateFixture> = {}): CandidateFixture => ({
  source: "google_ads",
  provider: "google_ads",
  providerVersion: "v25",
  currencyCode: null,
  timeZone: null,
  targeting: { geoTargetConstants: ["geoTargetConstants/2076"] },
  measuredAt: "2026-08-16T12:00:00.000Z",
  averageMonthlySearches: null,
  monthlySearchVolumes: [],
  competition: null,
  competitionIndex: null,
  lowTopOfPageBidMicros: null,
  highTopOfPageBidMicros: null,
  averageCpcMicros: null,
  ...overrides,
});

const acceptsRunConstraint = (value: RunFixture): boolean => {
  if (value.source === "google_ads") {
    return value.provider === "google_ads"
      && value.providerVersion === "v25"
      && value.seedOriginal !== null
      && value.seedCanonical !== null
      && value.relationshipMode !== null
      && value.language !== null
      && value.countryCode !== null
      && value.countryLabel !== null
      && value.languageConstant !== null
      && value.selectedStates !== null
      && value.stateLabels !== null
      && value.geoTargetConstants !== null
      && value.keywordPlanNetwork !== null
      && value.includeAdultKeywords !== null;
  }

  return (value.source === "manual" || value.source === "csv")
    && value.provider === null
    && value.providerVersion === null
    && value.seedOriginal === null
    && value.seedCanonical === null
    && value.relationshipMode === null
    && value.language === null
    && value.countryCode === null
    && value.countryLabel === null
    && value.languageConstant === null
    && value.selectedStates === null
    && value.stateLabels === null
    && value.geoTargetConstants === null
    && value.keywordPlanNetwork === null
    && value.includeAdultKeywords === null
    && value.currencyCode === null
    && value.timeZone === null;
};

const acceptsCandidateConstraint = (value: CandidateFixture): boolean => {
  if (value.source === "google_ads") {
    return value.provider === "google_ads"
      && value.providerVersion === "v25"
      && value.targeting !== null
      && value.measuredAt !== null;
  }

  return (value.source === "manual" || value.source === "csv")
    && value.provider === null
    && value.providerVersion === null
    && value.currencyCode === null
    && value.timeZone === null
    && value.targeting === null
    && value.measuredAt === null
    && value.averageMonthlySearches === null
    && JSON.stringify(value.monthlySearchVolumes) === "[]"
    && value.competition === null
    && value.competitionIndex === null
    && value.lowTopOfPageBidMicros === null
    && value.highTopOfPageBidMicros === null
    && value.averageCpcMicros === null;
};

test("0041 aceita Google Ads Research sem metadata e com metadata preenchida", () => {
  assert.equal(acceptsRunConstraint(completeRun()), true);
  assert.equal(acceptsRunConstraint(completeRun({ currencyCode: "BRL", timeZone: "America/Sao_Paulo" })), true);
  assert.equal(acceptsCandidateConstraint(completeCandidate()), true);
  assert.equal(acceptsCandidateConstraint(completeCandidate({ currencyCode: "BRL", timeZone: "America/Sao_Paulo" })), true);
});

test("0041 rejeita combinações Google Ads inválidas derivadas da CHECK", () => {
  assert.equal(acceptsRunConstraint(completeRun({ provider: "dataforseo" })), false);
  assert.equal(acceptsRunConstraint(completeRun({ providerVersion: "v24" })), false);
  assert.equal(acceptsRunConstraint(completeRun({ seedCanonical: null })), false);
  assert.equal(acceptsRunConstraint(completeRun({ includeAdultKeywords: null })), false);
  assert.equal(acceptsCandidateConstraint(completeCandidate({ provider: "dataforseo" })), false);
  assert.equal(acceptsCandidateConstraint(completeCandidate({ providerVersion: "v24" })), false);
  assert.equal(acceptsCandidateConstraint(completeCandidate({ targeting: null })), false);
  assert.equal(acceptsCandidateConstraint(completeCandidate({ measuredAt: null })), false);
});

test("0041 preserva as branches manual e CSV e rejeita campos de provider", () => {
  const manualRun = completeRun({ source: "manual", provider: null, providerVersion: null, seedOriginal: null, seedCanonical: null, relationshipMode: null, language: null, countryCode: null, countryLabel: null, languageConstant: null, selectedStates: null, stateLabels: null, geoTargetConstants: null, keywordPlanNetwork: null, includeAdultKeywords: null });
  const csvRun = { ...manualRun, source: "csv" };
  const manualCandidate = completeCandidate({ source: "manual", provider: null, providerVersion: null, targeting: null, measuredAt: null });
  const csvCandidate = { ...manualCandidate, source: "csv" };

  assert.equal(acceptsRunConstraint(manualRun), true);
  assert.equal(acceptsRunConstraint(csvRun), true);
  assert.equal(acceptsRunConstraint({ ...manualRun, provider: "google_ads" }), false);
  assert.equal(acceptsCandidateConstraint(manualCandidate), true);
  assert.equal(acceptsCandidateConstraint(csvCandidate), true);
  assert.equal(acceptsCandidateConstraint({ ...manualCandidate, targeting: {} }), false);
});

test("0041 rejeita source não previsto sem flexibilizar outras regras", () => {
  assert.equal(acceptsRunConstraint(completeRun({ source: "serper" })), false);
  assert.equal(acceptsCandidateConstraint(completeCandidate({ source: "serper" })), false);
});

test("migration 0041 permanece limitada às duas CHECKs alvo e sem mutação de dados", async () => {
  const migration = await readFile(migrationPath, "utf8");
  const sql = migration.replace(/--.*$/gm, "");
  assert.equal((migration.match(/DROP CONSTRAINT/g) ?? []).length, 2);
  assert.doesNotMatch(sql, /ALTER TABLE[^;]*ALTER COLUMN/i);
  assert.doesNotMatch(sql, /\b(INSERT|UPDATE|DELETE)\s+(INTO\s+)?/i);
  assert.doesNotMatch(sql, /CREATE TABLE|DROP TABLE|CREATE INDEX|DROP INDEX|CREATE TRIGGER|DROP TRIGGER|CREATE FUNCTION|DROP FUNCTION|GRANT|REVOKE/i);
  assert.match(sql, /source = 'google_ads'[\s\S]*?provider = 'google_ads'/);
  assert.match(sql, /source IN \('manual', 'csv'\)[\s\S]*?provider IS NULL/);
});

test("preflight captura snapshot completo e falha fechado no drift", async () => {
  const preflight = await readFile(preflightPath, "utf8");
  for (const token of [
    "0041-preflight-v2",
    "TARGET_CONSTRAINTS",
    "NON_TARGET_STRUCTURE",
    "jsonb_build_object",
    "pg_get_constraintdef",
    "pg_get_indexdef",
    "pg_get_triggerdef",
    "pg_get_functiondef",
    "pg_policies",
    "aclexplode",
    "relforcerowsecurity",
    "currency_null",
    "time_zone_null",
    "FAIL_CLOSED",
    "evidence_json",
  ]) assert.match(preflight, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(preflight, /expected_fingerprint/);
  assert.match(preflight, /821f77570a9bcc3b19b4505de0a4be39/);
  assert.match(preflight, /de59d81acc1f4f6d71f4cd79e5bbff14/);
  assert.doesNotMatch(preflight.replace(/--.*$/gm, ""), /\b(INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|GRANT|REVOKE)\s+/i);
});

test("post-verifier exige baseline real e compara todas as categorias não alvo", async () => {
  const verifier = await readFile(verifierPath, "utf8");
  for (const token of [
    "POST_VERIFIER_BASELINE_BINDING_REQUIRED = YES",
    "current_setting('minerador.baseline_0041_json', true)",
    "baseline_present",
    "target_delta_only",
    "non_target_structure_unchanged",
    "data_delta",
    "columns_types_defaults_nullability",
    "constraints_non_target",
    "primary_keys",
    "unique_constraints",
    "foreign_keys",
    "indexes",
    "triggers_and_functions",
    "rls",
    "policies",
    "owner",
    "acl_grants",
    "fail_closed_without_baseline",
    "aclexplode",
    "pg_get_functiondef",
  ]) assert.match(verifier, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(verifier, /ac3ed8d96da0eefcac555a1b25f68277/);
  assert.match(verifier, /05ec1957e0fc2900224e7d7e1afb1cc1/);
  assert.doesNotMatch(verifier.replace(/--.*$/gm, ""), /\b(INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|GRANT|REVOKE)\s+/i);
});

test("rollback permanece guarded e os pacotes históricos não entram no hardening", async () => {
  const [rollback, preflight, verifier] = await Promise.all([
    readFile(rollbackPath, "utf8"),
    readFile(preflightPath, "utf8"),
    readFile(verifierPath, "utf8"),
  ]);
  assert.match(rollback, /GOOGLE_ADS_RESEARCH_CONSTRAINT_ROLLBACK_BLOCKED/);
  assert.match(rollback, /currency_code IS NOT NULL/);
  assert.match(rollback, /time_zone IS NOT NULL/);
  assert.match(`${preflight}\n${verifier}`, /0041/);
});
